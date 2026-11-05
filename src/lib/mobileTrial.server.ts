import { hmacHex } from './entitlement';
import { normalizeMobile } from './mobileTrial';

async function database() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin;
}

async function hashMobile(phone: string) {
  const key = process.env['MOBILE_TRIAL_HASH_SECRET'];
  if (!key) throw new Error('A confirmação de celular não está configurada.');
  return hmacHex(key, normalizeMobile(phone));
}

async function twilio(path: string, body: Record<string, string>) {
  const gatewayKey = process.env['LOVABLE_API_KEY'];
  const connectionKey = process.env['TWILIO_API_KEY'];
  const service = process.env['TWILIO_VERIFY_SERVICE_SID'];
  if (!gatewayKey || !connectionKey || !service) throw new Error('A confirmação de celular não está configurada.');
  const response = await fetch(`https://connector-gateway.lovable.dev/twilio/verify/v2/Services/${service}/${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${gatewayKey}`, 'X-Connection-Api-Key': connectionKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!response.ok) {
    const raw = await response.text();
    let code: number | null = null;
    try { const parsed = JSON.parse(raw); if (typeof parsed.code === 'number') code = parsed.code; } catch { /* Never log raw provider errors: they may include phone numbers. */ }
    console.error('[mobile-verification] provider failure', { status: response.status, code });
    throw new Error(`SMS indisponível (${response.status}${code ? ` / ${code}` : ''}). Confira o saldo e as permissões da Twilio ou tente novamente.`);
  }
  return response.json() as Promise<{ sid: string; status: string }>;
}

export async function startMobileVerification(userId: string, phone: string) {
  const normalized = normalizeMobile(phone);
  const phoneHash = await hashMobile(normalized);
  const result = await twilio('Verifications', { To: normalized, Channel: 'sms', Locale: 'pt-BR' });
  if (result.status !== 'pending' || !/^VE[0-9a-f]{32}$/.test(result.sid)) throw new Error('Não foi possível enviar o código.');
  const db = await database();
  const { error } = await db.from('mobile_verifications').upsert({ user_id: userId, phone_hash: phoneHash, verification_sid: result.sid, expires_at: new Date(Date.now() + 600_000).toISOString(), verified_at: null });
  if (error) throw new Error('Não foi possível guardar a confirmação.');
  return { sent: true };
}

export async function confirmMobileVerification(userId: string, code: string) {
  const db = await database();
  const { data: pending, error } = await db.from('mobile_verifications').select('*').eq('user_id', userId).maybeSingle();
  if (error || !pending || Date.parse(pending.expires_at) <= Date.now()) throw new Error('Código expirado. Solicite outro SMS.');
  const result = await twilio('VerificationCheck', { VerificationSid: pending.verification_sid, Code: code });
  if (result.status !== 'approved') throw new Error('Código incorreto. Confira o SMS recebido.');
  const { error: saveError } = await db.from('mobile_verifications').update({ verified_at: new Date().toISOString() }).eq('user_id', userId).eq('verification_sid', pending.verification_sid);
  if (saveError) throw new Error('Não foi possível confirmar o celular.');
  const { getBillingSnapshot } = await import('./entitlement.server');
  const billing = await getBillingSnapshot(userId);
  const { data: claim, error: claimError } = await db.rpc('claim_mobile_trial', { p_user_id: userId, p_phone_hash: pending.phone_hash, p_legacy_start: billing.trial_started_at ?? undefined });
  if (claimError || !claim || typeof claim !== 'object' || Array.isArray(claim)) throw new Error('Não foi possível iniciar o teste.');
  return { eligible: claim['eligible'] === true };
}

export async function getMobileClaim(userId: string) {
  const db = await database();
  const { data, error } = await db.from('mobile_trial_claims').select('trial_started_at').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('Não foi possível verificar seu teste gratuito.');
  if (data) return { eligible: true, trial_started_at: data.trial_started_at };
  const { data: verified, error: verificationError } = await db.from('mobile_verifications').select('verified_at').eq('user_id', userId).maybeSingle();
  if (verificationError) throw new Error('Não foi possível verificar seu celular.');
  return verified?.verified_at ? { eligible: false, trial_started_at: null } : null;
}
import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { Smartphone, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendMobileCode, checkMobileCode } from '@/lib/mobileTrial.functions';

export function MobileVerification() {
  const send = useServerFn(sendMobileCode);
  const check = useServerFn(checkMobileCode);
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit() {
    setBusy(true); setMessage('');
    try {
      if (!sent) { await send({ data: { phone } }); setSent(true); setMessage('Código enviado por SMS.'); }
      else {
        const result = await check({ data: { code } });
        setMessage(result.eligible ? 'Celular confirmado!' : 'Este celular já utilizou o teste gratuito. Escolha um plano para continuar.');
        await qc.invalidateQueries({ queryKey: ['entitlement'] });
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível confirmar. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 border-t border-border py-4">
    <h3 className="flex items-center gap-2 font-semibold"><Smartphone className="size-4 text-primary" /> Confirmar celular</h3>
    <p className="text-sm text-muted-foreground">Um único teste gratuito de 48 horas por celular, mesmo com outro e-mail.</p>
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <Label htmlFor="trial-mobile">Celular com DDD</Label>
      <Input id="trial-mobile" type="tel" autoComplete="tel" placeholder="(51) 99999-9999" value={phone} disabled={sent || busy} onChange={(e) => setPhone(e.target.value)} required />
      {sent && <><Label htmlFor="trial-code">Código recebido por SMS</Label><Input id="trial-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required /></>}
      <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />}{sent ? 'Confirmar código' : 'Receber código por SMS'}</Button>
      {sent && <Button variant="ghost" type="button" disabled={busy} onClick={() => { setSent(false); setCode(''); setMessage(''); }}>Trocar celular ou solicitar outro código</Button>}
      {message && <p role="status" className="break-words text-sm text-muted-foreground">{message}</p>}
    </form>
  </section>;
}
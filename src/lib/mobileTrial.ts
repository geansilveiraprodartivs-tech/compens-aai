import { computeEntitlement, type Entitlement, type StoredBilling } from './entitlement';

export function normalizeMobile(value: string): string {
  const digits = value.replace(/\D/g, '');
  const full = digits.length === 11 ? `55${digits}` : digits;
  if (!/^55[1-9]\d9\d{8}$/.test(full)) throw new Error('Informe um celular brasileiro com DDD.');
  return `+${full}`;
}

export function mobileEntitlement(billing: StoredBilling, now: number, claim: { eligible: boolean; trial_started_at: string | null } | null): Entitlement {
  const base = computeEntitlement(billing, now);
  // Paid access and revoked subscriptions are never replaced by a free trial.
  if (base.has_access && base.state !== 'trial') return base;
  if (billing.subscription && billing.subscription.status !== 'pending') return base;
  if (!claim) return { ...base, has_access: false, verification_required: true };
  if (!claim.eligible) return { ...base, has_access: false, trial_duplicate: true };
  return computeEntitlement({ ...billing, trial_started_at: claim.trial_started_at }, now);
}
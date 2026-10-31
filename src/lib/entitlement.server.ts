/**
 * Camada de servidor do controle de acesso (trial + assinaturas).
 *
 * Nunca importe este arquivo do topo de um `*.functions.ts` ou de um arquivo de
 * rota: use `await import("@/lib/entitlement.server")` dentro do handler, como
 * já é feito com `client.server`.
 *
 * O estado fica em `auth.users.app_metadata.compensai`, gravado exclusivamente
 * com a service role (o usuário não consegue alterar esse campo pelo cliente).
 */
import {
  applyBillingUpdate,
  buildCheckoutUrl,
  computeEntitlement,
  eventKey,
  mapCaktoEvent,
  signCallbackToken,
  verifyCallbackToken,
  type Entitlement,
  type PlanId,
  type StoredBilling,
  type StoredSubscription,
} from "./entitlement";

export const BILLING_META_KEY = "compensai";

type AdminUser = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

function readBilling(appMetadata: Record<string, unknown> | null | undefined): StoredBilling {
  const raw = appMetadata?.[BILLING_META_KEY];
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;
  const billing: StoredBilling = {};
  if (typeof value["trial_started_at"] === "string") {
    billing.trial_started_at = value["trial_started_at"];
  }
  const sub = value["subscription"];
  if (sub && typeof sub === "object") {
    const s = sub as Record<string, unknown>;
    if (
      (s["plan"] === "monthly" || s["plan"] === "annual") &&
      typeof s["status"] === "string" &&
      typeof s["started_at"] === "string"
    ) {
      const subscription: StoredSubscription = {
        plan: s["plan"],
        status: s["status"] as StoredSubscription["status"],
        started_at: s["started_at"],
        expires_at: typeof s["expires_at"] === "string" ? s["expires_at"] : null,
        updated_at: typeof s["updated_at"] === "string" ? s["updated_at"] : s["started_at"],
      };
      if (typeof s["last_event"] === "string") subscription.last_event = s["last_event"];
      if (typeof s["last_event_id"] === "string") subscription.last_event_id = s["last_event_id"];
      billing.subscription = subscription;
    }
  }
  const processed = value["processed_events"];
  if (Array.isArray(processed)) {
    billing.processed_events = processed
      .filter((v): v is string => typeof v === "string")
      .slice(-25);
  }
  return billing;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function fetchUser(userId: string): Promise<AdminUser> {
  const db = await admin();
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    throw new Error(`Conta não encontrada: ${error?.message ?? userId}`);
  }
  return data.user as AdminUser;
}

async function persistBilling(userId: string, billing: StoredBilling): Promise<void> {
  const db = await admin();
  const user = await fetchUser(userId);
  const appMetadata: Record<string, unknown> = { ...(user.app_metadata ?? {}) };
  appMetadata[BILLING_META_KEY] = billing;
  const { error } = await db.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
  if (error) throw new Error(`Falha ao gravar assinatura: ${error.message}`);
}

/** Segredo do webhook da Cakto. Sem ele, nada é liberado (fail closed). */
export function webhookSecret(): string | null {
  const raw = process.env["CAKTO_WEBHOOK_SECRET"];
  const value = typeof raw === "string" ? raw.trim() : "";
  return value.length >= 8 ? value : null;
}

function callbackSecret(): string | null {
  const dedicated = process.env["CAKTO_CALLBACK_SECRET"];
  const value = typeof dedicated === "string" ? dedicated.trim() : "";
  if (value.length >= 8) return value;
  return webhookSecret();
}

export async function findUserByEmail(email: string): Promise<string | null> {
  const db = await admin();
  const target = email.trim().toLowerCase();
  if (!target) return null;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Falha ao localizar comprador: ${error.message}`);
    const users = (data?.users ?? []) as AdminUser[];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit.id;
    if (users.length < 200) return null;
  }
  return null;
}

/**
 * Entitlement do usuário. Na primeira leitura grava `trial_started_at` (a
 * "primeira ativação" da conta) — uma única vez, com o relógio do servidor.
 */
export async function getEntitlementForUser(userId: string): Promise<Entitlement> {
  const now = Date.now();
  const user = await fetchUser(userId);
  let billing = readBilling(user.app_metadata);

  if (!billing.trial_started_at) {
    billing = { ...billing, trial_started_at: new Date(now).toISOString() };
    await persistBilling(userId, billing);
  }

  return computeEntitlement(billing, now);
}

/** Usado pelas server functions premium: bloqueia quando não há acesso. */
export async function assertPremium(userId: string): Promise<Entitlement> {
  const entitlement = await getEntitlementForUser(userId);
  if (!entitlement.has_access) {
    const error = new Error("subscription_required");
    (error as Error & { code?: string }).code = "subscription_required";
    throw error;
  }
  return entitlement;
}

export async function createCheckoutLinkForUser(
  userId: string,
  plan: PlanId,
): Promise<{ url: string; plan: PlanId }> {
  const secret = callbackSecret();
  if (!webhookSecret()) {
    console.error(
      "[CompensAI] CAKTO_WEBHOOK_SECRET não configurado: o pagamento não será confirmado automaticamente.",
    );
  }
  const token = secret ? await signCallbackToken(userId, plan, secret) : null;
  return { url: buildCheckoutUrl(plan, token), plan };
}

/**
 * Resolve o dono do pagamento: primeiro o token assinado que viajou em
 * `?callback=`, depois o e-mail do comprador (fallback).
 */
export async function resolveBillingUser(input: {
  callback?: string | null;
  email?: string | null;
}): Promise<string | null> {
  const secret = callbackSecret();
  if (input.callback && secret) {
    const verified = await verifyCallbackToken(input.callback, secret);
    if (verified) return verified.userId;
  }
  if (input.email) return findUserByEmail(input.email);
  return null;
}

export type WebhookApplyResult = {
  applied: boolean;
  reason?: string;
  state?: string;
};

/** Aplica um evento da Cakto de forma idempotente. */
export async function applyCaktoEvent(
  userId: string,
  event: string,
  data: Record<string, unknown> | null,
): Promise<WebhookApplyResult> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const user = await fetchUser(userId);
  const billing = readBilling(user.app_metadata);
  const key = eventKey(event, data);

  if ((billing.processed_events ?? []).includes(key)) {
    return { applied: false, reason: "evento já processado" };
  }

  const update = mapCaktoEvent(
    event,
    (data as Parameters<typeof mapCaktoEvent>[1]) ?? null,
    billing.subscription ?? null,
    now,
  );

  if (update.kind === "ignore") {
    return { applied: false, reason: update.reason };
  }

  const next = applyBillingUpdate(billing, update, nowIso, key);
  await persistBilling(userId, next);
  return { applied: true, state: update.kind };
}

export async function getBillingSnapshot(userId: string): Promise<StoredBilling> {
  const user = await fetchUser(userId);
  return readBilling(user.app_metadata);
}

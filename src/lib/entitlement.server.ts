/**
 * Camada de servidor do controle de acesso (trial + assinaturas Cakto).
 *
 * Nunca importe este arquivo do topo de um `*.functions.ts` ou de um arquivo de
 * rota: use `await import("@/lib/entitlement.server")` dentro do handler, como
 * já é feito com `client.server`.
 *
 * O estado fica em `auth.users.app_metadata.compensai`, gravado exclusivamente
 * com a service role (o usuário não consegue alterar esse campo pelo cliente).
 * Nenhum dado pessoal do comprador é persistido: só valor, produto, oferta,
 * identificador da transação, data da aprovação e o log dos eventos.
 */
import {
  MAX_EVENT_LOG,
  MAX_PROCESSED_KEYS,
  applyEventToBilling,
  buildCheckoutUrl,
  computeEntitlement,
  grantAdminAccess,
  parsePlanMap,
  signCallbackToken,
  verifyCallbackToken,
  type Entitlement,
  type EventLogEntry,
  type EventLogResult,
  type PaymentRecord,
  type PlanId,
  type PlanMap,
  type PlanSource,
  type StoredBilling,
  type StoredSubscription,
  type SubscriptionStatus,
} from "./entitlement";
import { isSameSignupMailbox, normalizeSignupEmail } from "./trialOffer";
import { isAdminEmail } from "./adminAccount";

export const BILLING_META_KEY = "compensai";

const STATUSES: SubscriptionStatus[] = [
  "active",
  "late",
  "paused",
  "canceled",
  "expired",
  "refunded",
  "chargeback",
  "pending",
];

const RESULTS: EventLogResult[] = [
  "granted",
  "revoked",
  "canceled",
  "late",
  "paused",
  "resumed",
  "ignored",
  "duplicate",
  "unmapped",
];

type AdminUser = {
  id: string;
  email?: string | null;
  created_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function readPayment(value: unknown): PaymentRecord | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  const cents = typeof p["amount_cents"] === "number" ? p["amount_cents"] : null;
  return {
    amount_cents: cents,
    currency: str(p["currency"]),
    product_id: str(p["product_id"]),
    product_name: str(p["product_name"]),
    offer_id: str(p["offer_id"]),
    offer_name: str(p["offer_name"]),
    transaction_id: str(p["transaction_id"]),
    approved_at: str(p["approved_at"]),
  };
}

function readEvent(value: unknown): EventLogEntry | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Record<string, unknown>;
  const at = str(e["at"]);
  const event = str(e["event"]);
  const result = RESULTS.includes(e["result"] as EventLogResult)
    ? (e["result"] as EventLogResult)
    : null;
  if (!at || !event || !result) return null;

  const entry: EventLogEntry = { at, event, transaction_id: str(e["transaction_id"]), result };
  if (e["plan"] === "monthly" || e["plan"] === "annual") entry.plan = e["plan"];
  const source = str(e["plan_source"]);
  if (source) entry.plan_source = source as PlanSource;
  const detail = str(e["detail"]);
  if (detail) entry.detail = detail;
  return entry;
}

function readBilling(appMetadata: Record<string, unknown> | null | undefined): StoredBilling {
  const raw = appMetadata?.[BILLING_META_KEY];
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;
  const billing: StoredBilling = {};

  if (typeof value["trial_started_at"] === "string") {
    billing.trial_started_at = value["trial_started_at"];
  }

  if (typeof value["signup_notified_at"] === "string") {
    billing.signup_notified_at = value["signup_notified_at"];
  }

  const sub = value["subscription"];
  if (sub && typeof sub === "object") {
    const s = sub as Record<string, unknown>;
    if (
      (s["plan"] === "monthly" || s["plan"] === "annual") &&
      typeof s["status"] === "string" &&
      STATUSES.includes(s["status"] as SubscriptionStatus) &&
      typeof s["started_at"] === "string"
    ) {
      const subscription: StoredSubscription = {
        plan: s["plan"],
        status: s["status"] as SubscriptionStatus,
        started_at: s["started_at"],
        expires_at: typeof s["expires_at"] === "string" ? s["expires_at"] : null,
        updated_at: typeof s["updated_at"] === "string" ? s["updated_at"] : s["started_at"],
      };
      if (typeof s["last_event"] === "string") subscription.last_event = s["last_event"];
      if (typeof s["last_event_id"] === "string") subscription.last_event_id = s["last_event_id"];
      const payment = readPayment(s["payment"]);
      if (payment) subscription.payment = payment;
      billing.subscription = subscription;
    }
  }

  const processed = value["processed_events"];
  if (Array.isArray(processed)) {
    billing.processed_events = processed
      .filter((v): v is string => typeof v === "string")
      .slice(-MAX_PROCESSED_KEYS);
  }

  const events = value["events"];
  if (Array.isArray(events)) {
    billing.events = events
      .map(readEvent)
      .filter((v): v is EventLogEntry => v !== null)
      .slice(-MAX_EVENT_LOG);
  }

  if (typeof value["rev"] === "number" && Number.isFinite(value["rev"])) {
    billing.rev = value["rev"];
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

/**
 * Serializa eventos do mesmo usuário dentro desta instância do servidor. O
 * `rev` abaixo cobre escritas concorrentes entre instâncias diferentes.
 */
const locks = new Map<string, Promise<void>>();

async function withUserLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => gate).catch(() => gate);
  locks.set(key, chained);
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === chained) locks.delete(key);
  }
}

async function writeBilling(
  userId: string,
  metadata: Record<string, unknown>,
  billing: StoredBilling,
): Promise<void> {
  const db = await admin();
  const appMetadata: Record<string, unknown> = { ...metadata };
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

/**
 * Mapa produto/oferta → plano, configurado em `CAKTO_PLAN_MAP`. Sem essa
 * variável, o plano é inferido pelo nome do produto e, na falta dele, pelo
 * valor pago; quando nada bate, o evento é registrado como `unmapped` e o
 * acesso NÃO é liberado.
 */
export function planMap(): PlanMap {
  return parsePlanMap(process.env["CAKTO_PLAN_MAP"]);
}

export function planMapConfiguredCount(): number {
  const map = planMap();
  return Object.keys(map.products ?? {}).length + Object.keys(map.offers ?? {}).length;
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
 * Já existe conta para esta caixa de e-mail?
 *
 * O teste grátis é por CONTA e o `trial_started_at` fica em `app_metadata`
 * (gravado só pela service role): sair e entrar de novo nunca reinicia nada.
 * O furo que sobra é criar outra conta com a mesma caixa usando apelido
 * (`fulano+2@gmail.com`, `fu.lano@gmail.com`). Esta verificação fecha esse
 * caminho: compara o e-mail normalizado (sem `+tag` e, no Gmail, sem pontos).
 *
 * É uma trava de CADASTRO (deterrente), não uma decisão de acesso: quem chamar
 * a API do Supabase direto ainda cria a conta, mas o trial da nova conta é um
 * trial novo — o limite duro exigiria DDL (ver relatório).
 */
export async function hasAccountForEmailFamily(email: string): Promise<boolean> {
  const target = normalizeSignupEmail(email);
  if (!target) return false;

  const db = await admin();
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Falha ao verificar cadastro: ${error.message}`);
    const users = (data?.users ?? []) as AdminUser[];
    if (users.some((u) => isSameSignupMailbox(u.email, target))) return true;
    if (users.length < 200) return false;
  }
  return false;
}

/**
 * Entitlement do usuário. Na primeira leitura grava `trial_started_at` (a
 * "primeira ativação" da conta) — uma única vez, com o relógio do servidor.
 *
 * Contas administrativas (ver `adminAccount.ts`) recebem acesso premium
 * vitalício: a decisão usa o e-mail da conta autenticada, buscado aqui na
 * service role — o cliente não participa da decisão.
 */
export async function getEntitlementForUser(userId: string): Promise<Entitlement> {
  const now = Date.now();
  const user = await fetchUser(userId);
  let billing = readBilling(user.app_metadata);

  const mobileRequired = process.env['MOBILE_TRIAL_REQUIRED'] === 'true';
  if (!billing.trial_started_at && !mobileRequired) {
    billing = {
      ...billing,
      trial_started_at: new Date(now).toISOString(),
      rev: (billing.rev ?? 0) + 1,
    };
    await writeBilling(userId, user.app_metadata ?? {}, billing);
  }

  const entitlement = computeEntitlement(billing, now);
  if (isAdminEmail(user.email)) return grantAdminAccess(entitlement);
  if (!mobileRequired) return entitlement;
  const { getMobileClaim } = await import('./mobileTrial.server');
  const { mobileEntitlement } = await import('./mobileTrial');
  return mobileEntitlement(billing, now, await getMobileClaim(userId));
}

/* ------------------------------------------------- alerta de novo cadastro */

export type SignupAlertTarget = {
  id: string;
  name: string | null;
  email: string | null;
  created_at: string | null;
  /** Como entrou: `google`, `email`, ... */
  origin: string | null;
  /** Já recebeu alerta? (`signup_notified_at`) */
  already_notified: boolean;
};

function metadataText(
  meta: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (!meta) return null;
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

function signupName(user: AdminUser): string | null {
  const meta = user.user_metadata;
  const name = metadataText(meta, ["display_name", "full_name", "name", "given_name"]);
  if (name) return name;
  // Sem nome no perfil, o começo do e-mail já ajuda a identificar a pessoa.
  const email = (user.email ?? "").trim();
  if (!email) return null;
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

function signupOrigin(user: AdminUser): string | null {
  const meta = user.app_metadata;
  const provider = metadataText(meta, ["provider"]);
  if (provider) return provider;
  const providers = meta?.["providers"];
  if (Array.isArray(providers)) {
    const first = providers.find((v): v is string => typeof v === "string" && v.trim() !== "");
    if (first) return first;
  }
  return null;
}

/**
 * Dados do cadastro para o alerta — lidos do banco com a service role. Se a
 * conta não existir mais, devolve `null` (nada é enviado).
 */
export async function getSignupAlertTarget(userId: string): Promise<SignupAlertTarget | null> {
  let user: AdminUser;
  try {
    user = await fetchUser(userId);
  } catch {
    return null;
  }
  const billing = readBilling(user.app_metadata);
  return {
    id: user.id,
    name: signupName(user),
    email: str(user.email),
    created_at: str(user.created_at),
    origin: signupOrigin(user),
    already_notified:
      typeof billing.signup_notified_at === "string" && billing.signup_notified_at !== "",
  };
}

/**
 * Grava `signup_notified_at` (idempotência do alerta). Usa o MESMO lock/`rev`
 * da assinatura, para não sobrescrever um evento da Cakto gravado no mesmo
 * instante; se já estiver marcado, não faz nada.
 */
export async function markSignupNotified(userId: string): Promise<void> {
  await withUserLock(userId, async () => {
    const user = await fetchUser(userId);
    const billing = readBilling(user.app_metadata);
    if (billing.signup_notified_at) return;
    await writeBilling(userId, user.app_metadata ?? {}, {
      ...billing,
      signup_notified_at: new Date().toISOString(),
      rev: (billing.rev ?? 0) + 1,
    });
  });
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
 * `?callback=` (vínculo criado no checkout do app), depois o e-mail do
 * comprador — o identificador que a Cakto sempre envia.
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
  result: EventLogResult;
  reason: string;
  plan?: PlanId;
  plan_source?: PlanSource;
};

/**
 * Aplica um evento da Cakto de forma idempotente e segura.
 *
 * 1. serializa eventos do mesmo usuário nesta instância;
 * 2. lê o estado, aplica a regra pura e grava com `rev` novo;
 * 3. relê e confere o `rev` — se outra escrita venceu a corrida, recalcula em
 *    cima do estado mais novo (a deduplicação impede aplicar duas vezes).
 */
export async function applyCaktoEvent(
  userId: string,
  event: string,
  data: Record<string, unknown> | null,
): Promise<WebhookApplyResult> {
  return withUserLock(userId, async () => {
    const map = planMap();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const user = await fetchUser(userId);
      const before = readBilling(user.app_metadata);
      const outcome = applyEventToBilling({
        billing: before,
        event,
        data,
        nowMs: Date.now(),
        planMap: map,
      });

      const expectedRev = outcome.billing.rev ?? 0;
      await writeBilling(userId, user.app_metadata ?? {}, outcome.billing);

      const check = await fetchUser(userId);
      const after = readBilling(check.app_metadata);
      if ((after.rev ?? 0) === expectedRev) {
        const result: WebhookApplyResult = {
          applied: outcome.applied,
          result: outcome.result,
          reason: outcome.reason,
        };
        if (outcome.plan) result.plan = outcome.plan;
        if (outcome.plan_source) result.plan_source = outcome.plan_source;
        return result;
      }
      console.warn(
        `[cakto] escrita concorrente detectada ao processar ${event}; recalculando (tentativa ${attempt + 2})`,
      );
    }

    throw new Error(`não foi possível gravar o evento ${event} com segurança (concorrência)`);
  });
}

export async function getBillingSnapshot(userId: string): Promise<StoredBilling> {
  const user = await fetchUser(userId);
  return readBilling(user.app_metadata);
}

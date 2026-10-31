/**
 * Regras de acesso do CompensAI — teste gratuito de 48 horas e assinaturas.
 *
 * Este módulo é PURO (não importa nada de servidor) para poder ser usado no
 * cliente e testado com `node scripts/subscription.test.ts`. Toda decisão de
 * acesso é tomada no servidor com o relógio do servidor; aqui ficam apenas as
 * contas, os textos e o formato dos dados persistidos.
 */

export const TRIAL_HOURS = 48;
export const TRIAL_MS = TRIAL_HOURS * 60 * 60 * 1000;

export type PlanId = "monthly" | "annual";

export type SubscriptionStatus =
  "active" | "pending" | "canceled" | "expired" | "refunded" | "chargeback";

export type Plan = {
  id: PlanId;
  name: string;
  priceCents: number;
  priceLabel: string;
  periodLabel: string;
  periodDays: number;
  checkoutUrl: string;
  highlight: boolean;
};

export const PLANS: Record<PlanId, Plan> = {
  monthly: {
    id: "monthly",
    name: "CompensAI Mensal",
    priceCents: 1490,
    priceLabel: "R$ 14,90 por mês",
    periodLabel: "por mês",
    periodDays: 30,
    checkoutUrl: "https://pay.cakto.com.br/uc3zvg3_1167739",
    highlight: false,
  },
  annual: {
    id: "annual",
    name: "CompensAI Anual",
    priceCents: 9990,
    priceLabel: "R$ 99,90 por ano",
    periodLabel: "por ano",
    periodDays: 365,
    checkoutUrl: "https://pay.cakto.com.br/893demw",
    highlight: true,
  },
};

export const PLAN_LIST: Plan[] = [PLANS.annual, PLANS.monthly];

/** 99,90 / 12 = 8,325 — a oferta exibida é R$ 8,32 por mês. */
export const ANNUAL_MONTHLY_EQUIVALENT_CENTS = 832;

/** 12 × R$ 14,90 − R$ 99,90 = R$ 78,90. */
export const ANNUAL_SAVINGS_CENTS = PLANS.monthly.priceCents * 12 - PLANS.annual.priceCents;

export const GATE_TITLE = "Seu período gratuito terminou!";
export const GATE_SUBTITLE =
  "Continue aproveitando todo o potencial do CompensAI. Escolha seu plano e tenha acesso completo às ferramentas para organizar suas compras e economizar.";

export function formatBRL(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

/* ------------------------------------------------------------------ estado */

export type StoredSubscription = {
  plan: PlanId;
  status: SubscriptionStatus;
  started_at: string;
  /** Fim do acesso concedido. `null` quando não há prazo (não libera). */
  expires_at: string | null;
  updated_at: string;
  last_event?: string;
  last_event_id?: string;
};

export type StoredBilling = {
  trial_started_at?: string | null;
  subscription?: StoredSubscription | null;
  /** Últimos eventos de webhook já aplicados (idempotência). */
  processed_events?: string[];
};

export type AccessState =
  | "trial"
  | "trial_expired"
  | "monthly_active"
  | "annual_active"
  | "pending"
  | "canceled"
  | "expired"
  | "refunded"
  | "chargeback";

export type Entitlement = {
  state: AccessState;
  has_access: boolean;
  plan: PlanId | null;
  status: SubscriptionStatus | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_hours_remaining: number | null;
  subscription_expires_at: string | null;
  payment_pending: boolean;
  server_now: string;
};

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(fromMs: number, days: number): string {
  return new Date(fromMs + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Data de término de um novo período. Renovações somam a partir do que ainda
 * resta (nunca encurtam o acesso) e novas compras começam a contar de agora.
 */
export function nextExpiry(
  currentExpiresAt: string | null | undefined,
  plan: PlanId,
  nowMs: number,
): string {
  const current = parseDate(currentExpiresAt);
  const base = current && current.getTime() > nowMs ? current.getTime() : nowMs;
  return addDays(base, PLANS[plan].periodDays);
}

/** Classificação do plano a partir do nome do produto/oferta ou do valor pago. */
export function detectPlan(input: {
  productName?: string | null | undefined;
  offerName?: string | null | undefined;
  amount?: number | null | undefined;
  currency?: string | null | undefined;
}): PlanId | null {
  const name = `${input.productName ?? ""} ${input.offerName ?? ""}`.toLowerCase();
  if (/\banual\b|\bannual\b|\bano\b|\byearly\b|\b365\b/.test(name)) return "annual";
  if (/\bmensal\b|\bmonthly\b|\bm[êe]s\b|\b30 dias\b/.test(name)) return "monthly";

  const currency = (input.currency ?? "BRL").toUpperCase();
  const amount =
    typeof input.amount === "number" && Number.isFinite(input.amount) ? input.amount : null;
  if (amount === null || amount <= 0 || currency !== "BRL") return null;
  // 99,90 (anual) x 14,90 (mensal): o corte em R$ 40 separa com folga.
  return amount >= 40 ? "annual" : "monthly";
}

/**
 * Decide o estado de acesso. `nowMs` é SEMPRE o relógio do servidor.
 * Sem trial iniciado, o servidor grava `trial_started_at` antes de chamar aqui.
 */
export function computeEntitlement(billing: StoredBilling, nowMs: number): Entitlement {
  const trialStart = parseDate(billing.trial_started_at);
  const trialEnd = trialStart ? new Date(trialStart.getTime() + TRIAL_MS) : null;
  const trialActive = !!trialEnd && nowMs < trialEnd.getTime();

  const sub = billing.subscription ?? null;
  const subExpiry = parseDate(sub?.expires_at);
  const subAlive = !!subExpiry && subExpiry.getTime() > nowMs;

  let state: AccessState;
  let hasAccess = false;

  if (sub) {
    switch (sub.status) {
      case "refunded":
        state = "refunded";
        break;
      case "chargeback":
        state = "chargeback";
        break;
      case "expired":
        state = "expired";
        break;
      case "pending":
        // Pagamento em análise não libera nada; se o teste ainda vale, vale o teste.
        if (trialActive) {
          state = "trial";
          hasAccess = true;
        } else {
          state = "pending";
        }
        break;
      case "canceled":
        // Assinatura cancelada mantém o acesso até o fim do período já pago.
        state = "canceled";
        hasAccess = subAlive;
        break;
      case "active":
      default:
        if (subAlive) {
          state = sub.plan === "annual" ? "annual_active" : "monthly_active";
          hasAccess = true;
        } else {
          state = "expired";
        }
        break;
    }
  } else if (trialActive) {
    state = "trial";
    hasAccess = true;
  } else {
    state = "trial_expired";
  }

  const hoursLeft =
    trialActive && trialEnd ? Math.max(0, (trialEnd.getTime() - nowMs) / 3_600_000) : null;

  return {
    state,
    has_access: hasAccess,
    plan: sub?.plan ?? null,
    status: sub?.status ?? null,
    trial_started_at: trialStart ? trialStart.toISOString() : null,
    trial_ends_at: trialEnd ? trialEnd.toISOString() : null,
    trial_hours_remaining: hoursLeft,
    subscription_expires_at: sub?.expires_at ?? null,
    payment_pending: state === "pending",
    server_now: new Date(nowMs).toISOString(),
  };
}

/** Texto curto de status para o painel/gate. */
export function describeEntitlement(e: Entitlement): string {
  switch (e.state) {
    case "trial":
      return e.trial_hours_remaining !== null
        ? `Teste grátis ativo — ${formatRemaining(e.trial_hours_remaining)} restantes`
        : "Teste grátis ativo";
    case "trial_expired":
      return "Teste gratuito encerrado";
    case "monthly_active":
      return `Plano mensal ativo até ${formatDate(e.subscription_expires_at)}`;
    case "annual_active":
      return `Plano anual ativo até ${formatDate(e.subscription_expires_at)}`;
    case "pending":
      return "Pagamento em análise";
    case "canceled":
      return `Assinatura cancelada — acesso até ${formatDate(e.subscription_expires_at)}`;
    case "expired":
      return `Assinatura expirada em ${formatDate(e.subscription_expires_at)}`;
    case "refunded":
      return "Pagamento reembolsado";
    case "chargeback":
      return "Pagamento contestado";
  }
}

export function formatRemaining(hours: number): string {
  const totalMinutes = Math.max(0, Math.ceil(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m} min`;
  return m > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : `${h}h`;
}

export function formatDate(iso: string | null): string {
  const d = parseDate(iso);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

/* ------------------------------------------------------- webhook da Cakto */

export type BillingUpdate =
  | { kind: "grant"; event: string; plan: PlanId; status: "active"; expires_at: string }
  | { kind: "revoke"; event: string; plan: PlanId | null; status: "refunded" | "chargeback" }
  | {
      kind: "cancel";
      event: string;
      plan: PlanId | null;
      status: "canceled";
      expires_at: string | null;
    }
  | { kind: "pending"; event: string; plan: PlanId | null; status: "pending" }
  | { kind: "ignore"; event: string; reason: string };

const GRANT_EVENTS = new Set([
  "purchase_approved",
  "subscription_created",
  "subscription_renewed",
  "subscription_late_recovered",
]);

const PENDING_EVENTS = new Set([
  "purchase_refused",
  "subscription_late",
  "subscription_renewal_refused",
]);

const IGNORED_EVENTS = new Set([
  "checkout_abandonment",
  "initiate_checkout",
  "refund_requested",
  "dispute_defense_requested",
  "purchase_email_failed",
  "subscription_paused",
  "subscription_resumed",
  "pix_gerado",
  "boleto_gerado",
  "picpay_gerado",
  "openfinance_nubank_gerado",
  "oxxo_gerado",
  "spei_gerado",
  "pse_gerado",
  "nequi_gerado",
]);

type CaktoOrderLike = {
  product?: { name?: string | null } | null;
  offer?: { name?: string | null; price?: number | null } | null;
  amount?: number | null;
  currency?: string | null;
};

/** Traduz o evento da Cakto em uma alteração de assinatura. */
export function mapCaktoEvent(
  event: string,
  data: CaktoOrderLike | null,
  current: StoredSubscription | null,
  nowMs: number,
): BillingUpdate {
  const plan =
    detectPlan({
      productName: data?.product?.name,
      offerName: data?.offer?.name,
      amount: data?.amount ?? data?.offer?.price ?? null,
      currency: data?.currency ?? null,
    }) ??
    current?.plan ??
    null;

  if (GRANT_EVENTS.has(event)) {
    const chosen: PlanId = plan ?? "monthly";
    const keepBase =
      current && (current.status === "active" || current.status === "canceled")
        ? current.expires_at
        : null;
    return {
      kind: "grant",
      event,
      plan: chosen,
      status: "active",
      expires_at: nextExpiry(keepBase, chosen, nowMs),
    };
  }

  if (event === "refund") {
    return { kind: "revoke", event, plan, status: "refunded" };
  }

  if (event === "chargeback") {
    return { kind: "revoke", event, plan, status: "chargeback" };
  }

  if (event === "subscription_canceled") {
    const chosen: PlanId = plan ?? "monthly";
    return {
      kind: "cancel",
      event,
      plan,
      status: "canceled",
      expires_at: current?.expires_at ?? nextExpiry(null, chosen, nowMs),
    };
  }

  if (PENDING_EVENTS.has(event)) {
    return { kind: "pending", event, plan, status: "pending" };
  }

  if (IGNORED_EVENTS.has(event)) {
    return { kind: "ignore", event, reason: "evento não altera o acesso" };
  }

  return { kind: "ignore", event, reason: "evento desconhecido" };
}

/** Aplica a alteração ao registro persistido. */
export function applyBillingUpdate(
  billing: StoredBilling,
  update: BillingUpdate,
  nowIso: string,
  eventId?: string | null,
): StoredBilling {
  if (update.kind === "ignore") return billing;

  const current = billing.subscription ?? null;
  const base: StoredSubscription = {
    plan: update.plan ?? current?.plan ?? "monthly",
    status: update.status,
    started_at: current?.started_at ?? nowIso,
    expires_at: current?.expires_at ?? null,
    updated_at: nowIso,
    last_event: update.event,
  };

  if (update.kind === "grant") {
    base.plan = update.plan;
    base.expires_at = update.expires_at;
    // Nova compra aprovada depois de um período encerrado recomeça o período.
    if (!current || current.status === "refunded" || current.status === "chargeback") {
      base.started_at = nowIso;
    }
  } else if (update.kind === "revoke") {
    base.expires_at = nowIso;
  } else if (update.kind === "cancel") {
    base.expires_at = update.expires_at;
  } else if (update.kind === "pending") {
    base.expires_at = current?.expires_at ?? null;
  }

  if (eventId) base.last_event_id = eventId;

  const processed = [...(billing.processed_events ?? []), ...(eventId ? [eventId] : [])].slice(-25);

  return { ...billing, subscription: base, processed_events: processed };
}

export function eventKey(event: string, data: Record<string, unknown> | null): string {
  const id =
    (typeof data?.["id"] === "string" && data["id"]) ||
    (typeof data?.["refId"] === "string" && data["refId"]) ||
    "";
  if (id) return `${event}:${id}`;
  const email =
    (typeof (data?.["customer"] as { email?: unknown } | undefined)?.email === "string"
      ? ((data?.["customer"] as { email?: string }).email as string)
      : "") ||
    (typeof data?.["customerEmail"] === "string" ? (data["customerEmail"] as string) : "");
  const createdAt = typeof data?.["createdAt"] === "string" ? (data["createdAt"] as string) : "";
  return `${event}:${email}:${createdAt}`;
}

/* ------------------------------------------------- token de vínculo Cakto */

const TOKEN_VERSION = "c1";
const encoder = new TextEncoder();

function toBase64Url(text: string): string {
  const bytes = encoder.encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string | null {
  try {
    const padded =
      value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Token opaco colocado em `?callback=` no link do checkout. A Cakto devolve o
 * valor em `data.callback`, então conseguimos ligar o pagamento ao usuário
 * certo sem confiar em nada enviado pelo frontend no momento do webhook.
 */
export async function signCallbackToken(
  userId: string,
  plan: PlanId,
  secret: string,
): Promise<string> {
  const payload = `${TOKEN_VERSION}.${userId}.${plan}`;
  const b64 = toBase64Url(payload);
  const sig = (await hmacHex(secret, `cakto-callback.${b64}`)).slice(0, 32);
  return `${b64}.${sig}`;
}

export async function verifyCallbackToken(
  token: string,
  secret: string,
): Promise<{ userId: string; plan: PlanId } | null> {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  if (!b64 || !sig) return null;
  const expected = (await hmacHex(secret, `cakto-callback.${b64}`)).slice(0, 32);
  if (!safeEqual(sig.toLowerCase(), expected)) return null;
  const payload = fromBase64Url(b64);
  if (!payload) return null;
  const [version, userId, plan] = payload.split(".");
  if (version !== TOKEN_VERSION || !userId) return null;
  if (plan !== "monthly" && plan !== "annual") return null;
  return { userId, plan };
}

/** Link de checkout com o token de vínculo (quando há segredo configurado). */
export function buildCheckoutUrl(plan: PlanId, token?: string | null): string {
  const base = PLANS[plan].checkoutUrl;
  if (!token) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}callback=${encodeURIComponent(token)}`;
}

/* ------------------------------------------------- assinatura do webhook */

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/**
 * Valida `X-Cakto-Timestamp` + `X-Cakto-Signature` (`v1=<hmac-sha256 hex>` do
 * corpo cru, chave = segredo do webhook). Também recusa entrega antiga.
 */
export async function verifyWebhookSignature(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  nowMs?: number;
}): Promise<boolean> {
  const { rawBody, timestamp, signature, secret } = input;
  if (!timestamp || !signature || !secret) return false;
  const nowMs = input.nowMs ?? Date.now();
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(nowMs / 1000 - ts) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const expected = `v1=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`;
  // Em transições a Cakto pode mandar mais de uma assinatura separada por vírgula.
  return signature
    .split(",")
    .map((part) => part.trim())
    .some((part) => safeEqual(part, expected));
}

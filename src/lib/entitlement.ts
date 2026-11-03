/**
 * Regras de acesso do CompensAI — teste gratuito de 48 horas e assinaturas.
 *
 * Este módulo é PURO (não importa nada de servidor) para poder ser usado no
 * cliente e testado com `node scripts/*.test.ts`. Toda decisão de acesso é
 * tomada no servidor com o relógio do servidor; aqui ficam apenas as contas,
 * os textos e o formato dos dados persistidos.
 */

export const TRIAL_HOURS = 48;
export const TRIAL_MS = TRIAL_HOURS * 60 * 60 * 1000;

export type PlanId = "monthly" | "annual";

/**
 * Situação da assinatura.
 *
 * - `active`   — paga e dentro do período.
 * - `late`     — renovação em atraso/recusada: vale o período já pago.
 * - `paused`   — assinatura pausada na Cakto: acesso suspenso.
 * - `canceled` — sem renovação futura, mas o período pago continua valendo.
 * - `expired`  — período terminou.
 * - `refunded` / `chargeback` — acesso revogado na hora.
 * - `pending`  — pagamento em análise (nunca libera por si só).
 */
export type SubscriptionStatus =
  "active" | "late" | "paused" | "canceled" | "expired" | "refunded" | "chargeback" | "pending";

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

/** Dados do último pagamento confirmado. Nada de nome, e-mail, CPF ou endereço. */
export type PaymentRecord = {
  amount_cents: number | null;
  currency: string | null;
  product_id: string | null;
  product_name: string | null;
  offer_id: string | null;
  offer_name: string | null;
  transaction_id: string | null;
  approved_at: string | null;
};

export type StoredSubscription = {
  plan: PlanId;
  status: SubscriptionStatus;
  started_at: string;
  /** Fim do acesso concedido. `null` quando não há prazo (não libera). */
  expires_at: string | null;
  updated_at: string;
  last_event?: string;
  last_event_id?: string;
  payment?: PaymentRecord | null;
};

export type EventLogResult =
  | "granted"
  | "revoked"
  | "canceled"
  | "late"
  | "paused"
  | "resumed"
  | "ignored"
  | "duplicate"
  | "unmapped";

/** Registro enxuto de um evento recebido (sem dado pessoal do comprador). */
export type EventLogEntry = {
  at: string;
  event: string;
  transaction_id: string | null;
  result: EventLogResult;
  plan?: PlanId;
  plan_source?: PlanSource;
  detail?: string;
};

export type StoredBilling = {
  trial_started_at?: string | null;
  subscription?: StoredSubscription | null;
  /** Últimos eventos da Cakto já processados (idempotência). */
  processed_events?: string[];
  /** Últimos eventos recebidos, com o resultado de cada um (auditoria). */
  events?: EventLogEntry[];
  /** Contador usado para detectar escrita concorrente. */
  rev?: number;
};

export const MAX_EVENT_LOG = 50;
export const MAX_PROCESSED_KEYS = 50;

export type AccessState =
  | "admin"
  | "trial"
  | "trial_expired"
  | "monthly_active"
  | "annual_active"
  | "late"
  | "paused"
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
  /** Conta administradora do app (acesso premium vitalício, decidido no servidor). */
  admin?: boolean;
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

/* ------------------------------------------------------- plano do webhook */

/**
 * Correspondência explícita entre produto/oferta da Cakto e plano do CompensAI.
 * Configurada em `CAKTO_PLAN_MAP` (JSON), por exemplo:
 *
 *   {"products":{"<id-do-produto-anual>":"annual"},"offers":{"<id-da-oferta-mensal>":"monthly"}}
 *
 * Quando o ID está mapeado, ele é a única fonte da verdade — nome e valor são
 * ignorados para aquele pagamento.
 */
export type PlanMap = {
  products?: Record<string, PlanId>;
  offers?: Record<string, PlanId>;
};

export type PlanSource = "offer_map" | "product_map" | "name" | "price" | "none";

/**
 * Ponto de corte do valor pago, usado só quando não há ID mapeado nem nome
 * reconhecível: meio do caminho entre R$ 14,90 e R$ 99,90.
 */
export const ANNUAL_PRICE_THRESHOLD_CENTS = Math.round(
  (PLANS.monthly.priceCents + PLANS.annual.priceCents) / 2,
);

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function planIdOrNull(value: unknown): PlanId | null {
  return value === "monthly" || value === "annual" ? value : null;
}

function readPlanRecord(value: unknown): Record<string, PlanId> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, PlanId> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const plan = planIdOrNull(entry);
    if (plan && key.trim() !== "") out[key.trim()] = plan;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Lê `CAKTO_PLAN_MAP`. JSON inválido é ignorado (nenhum plano inventado). */
export function parsePlanMap(raw: string | null | undefined): PlanMap {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const source = parsed as Record<string, unknown>;
  const map: PlanMap = {};
  const products = readPlanRecord(source["products"]);
  const offers = readPlanRecord(source["offers"]);
  if (products) map.products = products;
  if (offers) map.offers = offers;
  return map;
}

export type PlanInput = {
  productId?: string | null | undefined;
  offerId?: string | null | undefined;
  productName?: string | null | undefined;
  offerName?: string | null | undefined;
  amount?: number | null | undefined;
  currency?: string | null | undefined;
};

export function detectPlan(input: PlanInput): PlanId | null {
  return resolvePlan(input, {}).plan;
}

/**
 * Descobre o plano do CompensAI. Ordem: ID da oferta → ID do produto → nome
 * (anual/mensal) → valor pago (somente BRL). Sem correspondência, devolve
 * `null` — e o webhook NÃO libera acesso (nada é inventado).
 */
export function resolvePlan(
  input: PlanInput,
  map: PlanMap,
): { plan: PlanId | null; source: PlanSource } {
  const offerId = asString(input.offerId);
  if (offerId && map.offers?.[offerId]) {
    return { plan: map.offers[offerId], source: "offer_map" };
  }
  const productId = asString(input.productId);
  if (productId && map.products?.[productId]) {
    return { plan: map.products[productId], source: "product_map" };
  }

  const name = `${input.productName ?? ""} ${input.offerName ?? ""}`.toLowerCase();
  if (/\banual\b|\bannual\b|\bano\b|\byearly\b|\b365\b/.test(name)) {
    return { plan: "annual", source: "name" };
  }
  if (/\bmensal\b|\bmonthly\b|\bm[êe]s\b|\b30 dias\b/.test(name)) {
    return { plan: "monthly", source: "name" };
  }

  const currency = (asString(input.currency) ?? "BRL").toUpperCase();
  const amount = asNumber(input.amount);
  if (amount === null || amount <= 0 || currency !== "BRL") {
    return { plan: null, source: "none" };
  }
  const cents = Math.round(amount * 100);
  return {
    plan: cents >= ANNUAL_PRICE_THRESHOLD_CENTS ? "annual" : "monthly",
    source: "price",
  };
}

/** Extrai só o que precisamos guardar de um pagamento (sem dados pessoais). */
export function paymentFromData(data: Record<string, unknown> | null): PaymentRecord {
  const product = (data?.["product"] ?? null) as Record<string, unknown> | null;
  const offer = (data?.["offer"] ?? null) as Record<string, unknown> | null;
  const amount = asNumber(data?.["amount"]) ?? asNumber(offer?.["price"]);
  return {
    amount_cents: amount === null ? null : Math.round(amount * 100),
    currency: (asString(data?.["currency"]) ?? null)?.toUpperCase() ?? null,
    product_id: asString(product?.["id"]),
    product_name: asString(product?.["name"]),
    offer_id: asString(offer?.["id"]),
    offer_name: asString(offer?.["name"]),
    transaction_id: asString(data?.["id"]) ?? asString(data?.["refId"]),
    approved_at: asString(data?.["paidAt"]) ?? asString(data?.["createdAt"]),
  };
}

/* ------------------------------------------------------- decisão de acesso */

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
      case "paused":
        // Assinatura pausada na Cakto: suspende o acesso.
        state = "paused";
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
      case "late":
        // Renovação em atraso: o período já pago continua valendo.
        state = "late";
        hasAccess = subAlive;
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

/**
 * Acesso da conta administradora do app: premium vitalício.
 *
 * É um "envelopamento" do entitlement calculado normalmente — o trial e a
 * assinatura continuam registrados (aparecem no perfil), mas quem manda é o
 * acesso liberado. Chamado apenas pelo servidor, depois de conferir o e-mail
 * autenticado com `isAdminEmail`.
 */
export function grantAdminAccess(base: Entitlement): Entitlement {
  return {
    ...base,
    state: "admin",
    has_access: true,
    plan: null,
    status: null,
    subscription_expires_at: null,
    payment_pending: false,
    admin: true,
  };
}

/** Texto curto de status para o painel/gate. */
export function describeEntitlement(e: Entitlement): string {
  switch (e.state) {
    case "admin":
      return "Conta administrativa — acesso premium vitalício";
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
    case "late":
      return e.has_access
        ? `Renovação em atraso — acesso até ${formatDate(e.subscription_expires_at)}`
        : `Renovação em atraso desde ${formatDate(e.subscription_expires_at)}`;
    case "paused":
      return "Assinatura pausada";
    case "pending":
      return "Pagamento em análise";
    case "canceled":
      return e.has_access
        ? `Assinatura cancelada — acesso até ${formatDate(e.subscription_expires_at)}`
        : `Assinatura cancelada em ${formatDate(e.subscription_expires_at)}`;
    case "expired":
      return `Assinatura expirada em ${formatDate(e.subscription_expires_at)}`;
    case "refunded":
      return "Pagamento reembolsado";
    case "chargeback":
      return "Pagamento contestado";
  }
}

export type PlanSummary = {
  planName: string;
  statusLabel: string;
  validityLabel: string;
  accessLabel: string;
  tone: "free" | "paid" | "blocked" | "pending" | "premium";
};

/** Resumo para a seção "Meu plano" (plano, situação, validade e tipo de acesso). */
export function planSummary(e: Entitlement): PlanSummary {
  const planName =
    e.state === "admin"
      ? "Administrador"
      : e.state === "trial" || e.state === "trial_expired"
        ? "Teste gratuito"
        : e.plan
          ? PLANS[e.plan].name
          : "Sem plano ativo";

  let statusLabel: string;
  let accessLabel: string;
  let tone: PlanSummary["tone"] = "blocked";

  switch (e.state) {
    case "admin":
      statusLabel = "Conta administrativa";
      accessLabel = "Premium vitalício";
      tone = "premium";
      break;
    case "trial":
      statusLabel = "Teste gratuito ativo";
      accessLabel = "Acesso gratuito";
      tone = "free";
      break;
    case "trial_expired":
      statusLabel = "Teste gratuito encerrado";
      accessLabel = "Acesso expirado";
      break;
    case "monthly_active":
    case "annual_active":
      statusLabel = "Assinatura ativa";
      accessLabel = "Acesso pago";
      tone = "paid";
      break;
    case "late":
      statusLabel = "Renovação em atraso";
      accessLabel = e.has_access ? "Acesso pago" : "Acesso expirado";
      tone = e.has_access ? "paid" : "blocked";
      break;
    case "paused":
      statusLabel = "Assinatura pausada";
      accessLabel = "Acesso suspenso";
      break;
    case "pending":
      statusLabel = "Pagamento em análise";
      accessLabel = "Aguardando confirmação do pagamento";
      tone = "pending";
      break;
    case "canceled":
      statusLabel = "Assinatura cancelada";
      accessLabel = e.has_access ? "Acesso pago até o fim do período" : "Acesso cancelado";
      tone = e.has_access ? "paid" : "blocked";
      break;
    case "expired":
      statusLabel = "Assinatura expirada";
      accessLabel = "Acesso expirado";
      break;
    case "refunded":
      statusLabel = "Pagamento reembolsado";
      accessLabel = "Acesso revogado";
      break;
    case "chargeback":
      statusLabel = "Pagamento contestado";
      accessLabel = "Acesso revogado";
      break;
  }

  const validitySource =
    e.state === "trial" || e.state === "trial_expired"
      ? e.trial_ends_at
      : e.subscription_expires_at;
  const validityLabel = formatValidity(e, validitySource);

  return { planName, statusLabel, validityLabel, accessLabel, tone };
}

function formatValidity(e: Entitlement, iso: string | null): string {
  if (e.state === "admin") return "Vitalício, sem prazo";
  if (!iso) return "Sem data de validade";
  if (e.state === "trial") return `Até ${formatDateTime(iso)}`;
  if (e.state === "expired" || e.state === "trial_expired")
    return `Encerrado em ${formatDate(iso)}`;
  if (e.state === "refunded" || e.state === "chargeback" || e.state === "paused") {
    return `Interrompido em ${formatDate(iso)}`;
  }
  return `Válido até ${formatDate(iso)}`;
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

export function formatDateTime(iso: string | null): string {
  const d = parseDate(iso);
  if (!d) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/* ------------------------------------------------------- webhook da Cakto */

export type BillingUpdate =
  | {
      kind: "grant";
      event: string;
      plan: PlanId;
      status: "active";
      expires_at: string;
      payment: PaymentRecord;
    }
  | { kind: "revoke"; event: string; plan: PlanId | null; status: "refunded" | "chargeback" }
  | {
      kind: "cancel";
      event: string;
      plan: PlanId | null;
      status: "canceled";
      expires_at: string | null;
    }
  | { kind: "late"; event: string; plan: PlanId | null; status: "late" }
  | { kind: "pause"; event: string; status: "paused" }
  | { kind: "resume"; event: string; status: "active" }
  | { kind: "ignore"; event: string; reason: string }
  | { kind: "unmapped"; event: string; reason: string };

const GRANT_EVENTS = new Set([
  "purchase_approved",
  "subscription_created",
  "subscription_renewed",
  "subscription_late_recovered",
]);

/** Eventos que nunca mudam o acesso (só registram). */
const IGNORED_EVENTS = new Set([
  "checkout_abandonment",
  "initiate_checkout",
  "refund_requested",
  "dispute_defense_requested",
  "purchase_email_failed",
  "purchase_refused",
  "pix_gerado",
  "boleto_gerado",
  "picpay_gerado",
  "openfinance_nubank_gerado",
  "oxxo_gerado",
  "spei_gerado",
  "pse_gerado",
  "nequi_gerado",
]);

/**
 * Ruído de pré-venda/checkout: não mexe no acesso e não vale ocupar o log do
 * usuário. O webhook responde 2xx na hora, sem varrer contas para descobrir o
 * comprador.
 */
const NOISE_EVENTS = new Set([
  "checkout_abandonment",
  "initiate_checkout",
  "purchase_email_failed",
]);

export function isNoiseEvent(event: string): boolean {
  return NOISE_EVENTS.has(event) || /_gerado$/.test(event);
}

type CaktoOrderLike = {
  id?: string | null;
  product?: { id?: string | null; name?: string | null } | null;
  offer?: { id?: string | null; name?: string | null; price?: number | null } | null;
  amount?: number | null;
  currency?: string | null;
};

function planInputFromData(data: CaktoOrderLike | null): PlanInput {
  return {
    productId: data?.product?.id,
    offerId: data?.offer?.id,
    productName: data?.product?.name,
    offerName: data?.offer?.name,
    amount: data?.amount ?? data?.offer?.price ?? null,
    currency: data?.currency ?? null,
  };
}

/** Traduz o evento da Cakto em uma alteração de assinatura. */
export function mapCaktoEvent(
  event: string,
  data: CaktoOrderLike | null,
  current: StoredSubscription | null,
  nowMs: number,
  map: PlanMap = {},
): BillingUpdate {
  const resolved = resolvePlan(planInputFromData(data), map);
  const plan = resolved.plan ?? current?.plan ?? null;

  if (GRANT_EVENTS.has(event)) {
    if (!resolved.plan) {
      return {
        kind: "unmapped",
        event,
        reason: "plano não identificado — configure CAKTO_PLAN_MAP com os IDs da Cakto",
      };
    }
    const keepBase =
      current &&
      (current.status === "active" || current.status === "late" || current.status === "canceled")
        ? current.expires_at
        : null;
    return {
      kind: "grant",
      event,
      plan: resolved.plan,
      status: "active",
      expires_at: nextExpiry(keepBase, resolved.plan, nowMs),
      payment: paymentFromData((data ?? null) as Record<string, unknown> | null),
    };
  }

  if (event === "refund") {
    return { kind: "revoke", event, plan, status: "refunded" };
  }

  if (event === "chargeback") {
    return { kind: "revoke", event, plan, status: "chargeback" };
  }

  if (event === "subscription_canceled") {
    // Não inventa período: vale o que já foi pago (ou nada).
    return {
      kind: "cancel",
      event,
      plan,
      status: "canceled",
      expires_at: current?.expires_at ?? null,
    };
  }

  if (event === "subscription_late" || event === "subscription_renewal_refused") {
    return { kind: "late", event, plan, status: "late" };
  }

  if (event === "subscription_paused") {
    return { kind: "pause", event, status: "paused" };
  }

  if (event === "subscription_resumed") {
    return { kind: "resume", event, status: "active" };
  }

  if (IGNORED_EVENTS.has(event)) {
    return { kind: "ignore", event, reason: "evento não altera o acesso" };
  }

  return { kind: "ignore", event, reason: "evento desconhecido" };
}

/** Resultado da aplicação de um evento ao registro persistido. */
export type ApplyEventResult = {
  billing: StoredBilling;
  applied: boolean;
  result: EventLogResult;
  reason: string;
  plan?: PlanId;
  plan_source?: PlanSource;
};

function withLog(billing: StoredBilling, entry: EventLogEntry, bumpRev: boolean): StoredBilling {
  const next: StoredBilling = {
    ...billing,
    events: [...(billing.events ?? []), entry].slice(-MAX_EVENT_LOG),
  };
  if (bumpRev) next.rev = (billing.rev ?? 0) + 1;
  return next;
}

function logEntry(
  event: string,
  data: Record<string, unknown> | null,
  result: EventLogResult,
  at: string,
  extra?: { plan?: PlanId | null; plan_source?: PlanSource; detail?: string },
): EventLogEntry {
  const entry: EventLogEntry = {
    at,
    event,
    transaction_id: asString(data?.["id"]) ?? asString(data?.["refId"]),
    result,
  };
  if (extra?.plan) entry.plan = extra.plan;
  if (extra?.plan_source) entry.plan_source = extra.plan_source;
  if (extra?.detail) entry.detail = extra.detail;
  return entry;
}

/**
 * Aplica um evento de webhook ao estado, de forma idempotente.
 *
 * Função pura: o servidor só persiste o `billing` devolvido. Eventos repetidos
 * (mesma chave) e eventos sem correspondência de plano NÃO alteram o acesso.
 */
export function applyEventToBilling(input: {
  billing: StoredBilling;
  event: string;
  data: Record<string, unknown> | null;
  nowMs: number;
  planMap?: PlanMap;
}): ApplyEventResult {
  const { event, data, nowMs } = input;
  const map = input.planMap ?? {};
  const nowIso = new Date(nowMs).toISOString();
  const key = eventKey(event, data);
  const billing = input.billing;
  const planInput = planInputFromData((data ?? null) as CaktoOrderLike | null);
  const resolved = resolvePlan(planInput, map);

  if ((billing.processed_events ?? []).includes(key)) {
    const logged = withLog(
      billing,
      logEntry(event, data, "duplicate", nowIso, {
        plan: resolved.plan,
        plan_source: resolved.source,
        detail: "evento já processado",
      }),
      true,
    );
    return { billing: logged, applied: false, result: "duplicate", reason: "evento já processado" };
  }

  const update = mapCaktoEvent(
    event,
    (data ?? null) as CaktoOrderLike | null,
    billing.subscription ?? null,
    nowMs,
    map,
  );

  if (update.kind === "ignore") {
    const next: StoredBilling = {
      ...withLog(
        billing,
        logEntry(event, data, "ignored", nowIso, {
          plan_source: resolved.source,
          detail: update.reason,
        }),
        true,
      ),
      processed_events: [...(billing.processed_events ?? []), key].slice(-MAX_PROCESSED_KEYS),
    };
    return { billing: next, applied: false, result: "ignored", reason: update.reason };
  }

  if (update.kind === "unmapped") {
    // Não marca como processado: depois de configurar o mapa, o mesmo evento
    // pode ser reenviado pelo painel e será aplicado.
    const next = withLog(
      billing,
      logEntry(event, data, "unmapped", nowIso, {
        plan_source: resolved.source,
        detail: update.reason,
      }),
      true,
    );
    return {
      billing: next,
      applied: false,
      result: "unmapped",
      reason: update.reason,
      plan_source: resolved.source,
    };
  }

  const current = billing.subscription ?? null;
  const updatePlan = update.kind === "pause" || update.kind === "resume" ? null : update.plan;
  const subscription: StoredSubscription = {
    plan: updatePlan ?? current?.plan ?? "monthly",
    status: update.status,
    started_at: current?.started_at ?? nowIso,
    expires_at: current?.expires_at ?? null,
    updated_at: nowIso,
    last_event: update.event,
  };
  if (current?.payment) subscription.payment = current.payment;

  let result: EventLogResult;

  switch (update.kind) {
    case "grant":
      subscription.plan = update.plan;
      subscription.expires_at = update.expires_at;
      subscription.payment = update.payment;
      // Nova compra aprovada depois de um período encerrado recomeça o período.
      if (!current || current.status === "refunded" || current.status === "chargeback") {
        subscription.started_at = nowIso;
      }
      result = "granted";
      break;
    case "revoke":
      subscription.expires_at = nowIso;
      result = "revoked";
      break;
    case "cancel":
      subscription.expires_at = update.expires_at;
      result = "canceled";
      break;
    case "late":
      result = "late";
      break;
    case "pause":
      result = "paused";
      break;
    case "resume":
      result = "resumed";
      break;
  }

  subscription.last_event_id = key;

  const next: StoredBilling = {
    ...withLog(
      billing,
      logEntry(event, data, result, nowIso, {
        plan: subscription.plan,
        plan_source: resolved.source,
      }),
      true,
    ),
    subscription,
    processed_events: [...(billing.processed_events ?? []), key].slice(-MAX_PROCESSED_KEYS),
  };

  return {
    billing: next,
    applied: true,
    result,
    reason: "aplicado",
    plan: subscription.plan,
    plan_source: resolved.source,
  };
}

/**
 * Chave de deduplicação. Usa o `id` do pedido (estável entre reenvios) e, na
 * ausência dele, dados que não são pessoais.
 */
export function eventKey(event: string, data: Record<string, unknown> | null): string {
  const id = asString(data?.["id"]) ?? asString(data?.["refId"]);
  if (id) return `${event}:${id}`;
  const createdAt = asString(data?.["createdAt"]) ?? "";
  const product = asString((data?.["product"] as { id?: unknown } | undefined)?.id) ?? "";
  const offer = asString((data?.["offer"] as { id?: unknown } | undefined)?.id) ?? "";
  return `${event}:${createdAt}:${product}:${offer}`;
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

// Testes do teste gratuito de 48 horas + assinaturas Cakto do CompensAI.
//
// Roda com:  node scripts/subscription.test.ts
//
// Nenhum pagamento real é feito: os eventos são payloads sintéticos.

import assert from "node:assert/strict";
import {
  ANNUAL_MONTHLY_EQUIVALENT_CENTS,
  ANNUAL_SAVINGS_CENTS,
  ANNUAL_PRICE_THRESHOLD_CENTS,
  GATE_SUBTITLE,
  GATE_TITLE,
  MAX_EVENT_LOG,
  PLANS,
  TRIAL_MS,
  applyEventToBilling,
  buildCheckoutUrl,
  computeEntitlement,
  describeEntitlement,
  detectPlan,
  eventKey,
  formatBRL,
  formatRemaining,
  hmacHex,
  isNoiseEvent,
  mapCaktoEvent,
  nextExpiry,
  parsePlanMap,
  paymentFromData,
  planSummary,
  resolvePlan,
  signCallbackToken,
  verifyCallbackToken,
  verifyWebhookSignature,
  type PlanMap,
  type StoredBilling,
  type StoredSubscription,
} from "../src/lib/entitlement.ts";

const NOW = Date.parse("2026-10-31T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SECRET = "segredo-de-teste-do-webhook-cakto";

const cases: Array<[string, () => void | Promise<void>]> = [];

function test(name: string, fn: () => void | Promise<void>) {
  cases.push([name, fn]);
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function sub(overrides: Partial<StoredSubscription> = {}): StoredSubscription {
  return {
    plan: "monthly",
    status: "active",
    started_at: iso(NOW - 5 * DAY),
    expires_at: iso(NOW + 25 * DAY),
    updated_at: iso(NOW),
    ...overrides,
  };
}

/** Payload parecido com o pedido real da Cakto (com PII, que não é guardada). */
function approvedData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "trx-1",
    refId: "ref-1",
    status: "approved",
    amount: 14.9,
    currency: "BRL",
    createdAt: iso(NOW),
    paidAt: iso(NOW),
    product: { id: "prod-mensal", name: "CompensAI Mensal" },
    offer: { id: "oferta-mensal", name: "Assinatura Mensal", price: 14.9 },
    customer: { email: "comprador@exemplo.com", name: "Fulano de Tal" },
    ...overrides,
  };
}

const MAP: PlanMap = parsePlanMap(
  '{"products":{"prod-anual":"annual","prod-mensal":"monthly"},"offers":{"oferta-anual":"annual"}}',
);

/* ------------------------------------------------------------------ preços */

test("planos têm exatamente os valores pedidos", () => {
  assert.equal(PLANS.monthly.priceCents, 1490);
  assert.equal(PLANS.monthly.priceLabel, "R$ 14,90 por mês");
  assert.equal(PLANS.annual.priceCents, 9990);
  assert.equal(PLANS.annual.priceLabel, "R$ 99,90 por ano");
  assert.equal(formatBRL(PLANS.monthly.priceCents), "R$ 14,90");
  assert.equal(formatBRL(PLANS.annual.priceCents), "R$ 99,90");
});

test("anual equivale a R$ 8,32 por mês e economiza R$ 78,90", () => {
  assert.equal(formatBRL(ANNUAL_MONTHLY_EQUIVALENT_CENTS), "R$ 8,32");
  assert.equal(ANNUAL_SAVINGS_CENTS, 7890);
  assert.equal(formatBRL(ANNUAL_SAVINGS_CENTS), "R$ 78,90");
  assert.equal(12 * PLANS.monthly.priceCents - PLANS.annual.priceCents, ANNUAL_SAVINGS_CENTS);
});

test("links da Cakto são exatamente os informados", () => {
  assert.equal(PLANS.monthly.checkoutUrl, "https://pay.cakto.com.br/uc3zvg3_1167739");
  assert.equal(PLANS.annual.checkoutUrl, "https://pay.cakto.com.br/893demw");
});

test("textos da tela de assinatura", () => {
  assert.equal(GATE_TITLE, "Seu período gratuito terminou!");
  assert.match(GATE_SUBTITLE, /todo o potencial do CompensAI/);
  assert.match(GATE_SUBTITLE, /organizar suas compras e economizar/);
});

/* ------------------------------------------------------ teste de 48 horas */

test("novo usuário recebe exatamente 48h de acesso total", () => {
  const e = computeEntitlement({ trial_started_at: iso(NOW) }, NOW);
  assert.equal(e.state, "trial");
  assert.equal(e.has_access, true);
  assert.equal(e.trial_ends_at, iso(NOW + 48 * HOUR));
  assert.equal(e.trial_ends_at, iso(NOW + TRIAL_MS));
  assert.equal(e.trial_hours_remaining, 48);
});

test("47h59 ainda tem acesso", () => {
  const startedAt = iso(NOW);
  const e = computeEntitlement({ trial_started_at: startedAt }, NOW + 47 * HOUR + 59 * 60 * 1000);
  assert.equal(e.has_access, true);
  assert.equal(e.state, "trial");
  assert.ok((e.trial_hours_remaining ?? 0) > 0 && (e.trial_hours_remaining ?? 0) < 0.1);
});

test("ao completar 48h o acesso é bloqueado", () => {
  const startedAt = iso(NOW);
  const e = computeEntitlement({ trial_started_at: startedAt }, NOW + TRIAL_MS);
  assert.equal(e.state, "trial_expired");
  assert.equal(e.has_access, false);
  assert.equal(e.trial_hours_remaining, null);
});

test("trial de 3 dias atrás já expirou", () => {
  const e = computeEntitlement({ trial_started_at: iso(NOW - 3 * DAY) }, NOW);
  assert.equal(e.state, "trial_expired");
  assert.equal(e.has_access, false);
});

test("sair e entrar de novo não reinicia o período", () => {
  const startedAt = iso(NOW);
  const primeiro = computeEntitlement({ trial_started_at: startedAt }, NOW + 40 * HOUR);
  const segundo = computeEntitlement(
    { trial_started_at: primeiro.trial_started_at! },
    NOW + 40 * HOUR + 60_000,
  );
  assert.equal(segundo.trial_started_at, startedAt);
  assert.equal(segundo.state, "trial");
  assert.ok((segundo.trial_hours_remaining ?? 0) < 8);
  const terceiro = computeEntitlement({ trial_started_at: startedAt }, NOW + 47 * HOUR);
  assert.equal(terceiro.state, "trial");
  assert.ok((terceiro.trial_hours_remaining ?? 0) <= 1);
});

/* --------------------------------------------------------- assinaturas */

test("plano mensal ativo libera o acesso", () => {
  const e = computeEntitlement({ trial_started_at: iso(NOW - 10 * DAY), subscription: sub() }, NOW);
  assert.equal(e.state, "monthly_active");
  assert.equal(e.has_access, true);
  assert.equal(e.plan, "monthly");
  assert.equal(e.payment_pending, false);
});

test("plano anual ativo libera o acesso", () => {
  const e = computeEntitlement(
    {
      trial_started_at: iso(NOW - 10 * DAY),
      subscription: sub({ plan: "annual", expires_at: iso(NOW + 300 * DAY) }),
    },
    NOW,
  );
  assert.equal(e.state, "annual_active");
  assert.equal(e.has_access, true);
  assert.equal(e.plan, "annual");
});

test("assinatura expirada bloqueia mesmo com assinatura registrada", () => {
  const e = computeEntitlement(
    { trial_started_at: iso(NOW - 40 * DAY), subscription: sub({ expires_at: iso(NOW - 1000) }) },
    NOW,
  );
  assert.equal(e.state, "expired");
  assert.equal(e.has_access, false);
});

test("assinatura ativa mantém acesso mesmo com trial vencido", () => {
  const e = computeEntitlement({ trial_started_at: iso(NOW - 90 * DAY), subscription: sub() }, NOW);
  assert.equal(e.has_access, true);
  assert.equal(e.state, "monthly_active");
});

test("pagamento pendente durante o trial não bloqueia o teste", () => {
  const e = computeEntitlement(
    { trial_started_at: iso(NOW), subscription: sub({ status: "pending", expires_at: null }) },
    NOW + HOUR,
  );
  assert.equal(e.state, "trial");
  assert.equal(e.has_access, true);
  assert.equal(e.payment_pending, false);
});

test("pagamento pendente sem trial bloqueia", () => {
  const e = computeEntitlement(
    {
      trial_started_at: iso(NOW - 5 * DAY),
      subscription: sub({ status: "pending", expires_at: null }),
    },
    NOW,
  );
  assert.equal(e.state, "pending");
  assert.equal(e.has_access, false);
  assert.equal(e.payment_pending, true);
});

test("assinatura cancelada mantém acesso até o fim do período pago", () => {
  const e = computeEntitlement(
    { trial_started_at: iso(NOW - 40 * DAY), subscription: sub({ status: "canceled" }) },
    NOW,
  );
  assert.equal(e.state, "canceled");
  assert.equal(e.has_access, true);
});

test("assinatura cancelada e vencida bloqueia", () => {
  const e = computeEntitlement(
    {
      trial_started_at: iso(NOW - 40 * DAY),
      subscription: sub({ status: "canceled", expires_at: iso(NOW - DAY) }),
    },
    NOW,
  );
  assert.equal(e.state, "canceled");
  assert.equal(e.has_access, false);
});

test("renovação em atraso mantém o período já pago", () => {
  const dentro = computeEntitlement({ subscription: sub({ status: "late" }) }, NOW);
  assert.equal(dentro.state, "late");
  assert.equal(dentro.has_access, true);

  const fora = computeEntitlement(
    { subscription: sub({ status: "late", expires_at: iso(NOW - DAY) }) },
    NOW,
  );
  assert.equal(fora.state, "late");
  assert.equal(fora.has_access, false);
});

test("assinatura pausada suspende o acesso na hora", () => {
  const e = computeEntitlement({ subscription: sub({ status: "paused" }) }, NOW);
  assert.equal(e.state, "paused");
  assert.equal(e.has_access, false);
});

test("reembolso revoga o acesso na hora", () => {
  const e = computeEntitlement(
    { trial_started_at: iso(NOW - 1 * HOUR), subscription: sub({ status: "refunded" }) },
    NOW,
  );
  assert.equal(e.state, "refunded");
  assert.equal(e.has_access, false);
});

test("chargeback revoga o acesso na hora", () => {
  const e = computeEntitlement(
    { trial_started_at: iso(NOW - 1 * HOUR), subscription: sub({ status: "chargeback" }) },
    NOW,
  );
  assert.equal(e.state, "chargeback");
  assert.equal(e.has_access, false);
});

/* ----------------------------------------------------- renovação/período */

test("renovação soma a partir do tempo que sobrou", () => {
  assert.equal(nextExpiry(iso(NOW + 10 * DAY), "monthly", NOW), iso(NOW + 40 * DAY));
});

test("compra depois de expirado começa a contar de agora", () => {
  assert.equal(nextExpiry(iso(NOW - 5 * DAY), "monthly", NOW), iso(NOW + 30 * DAY));
  assert.equal(nextExpiry(null, "annual", NOW), iso(NOW + 365 * DAY));
});

/* ------------------------------------------------------- plano do webhook */

test("CAKTO_PLAN_MAP inválido é ignorado (nada é inventado)", () => {
  assert.deepEqual(parsePlanMap("não é json"), {});
  assert.deepEqual(parsePlanMap("[]"), {});
  assert.deepEqual(parsePlanMap('{"products":{"x":"trimestral"}}'), {});
  assert.deepEqual(parsePlanMap(null), {});
  assert.deepEqual(parsePlanMap('{"products":{"prod-1":"annual"}}'), {
    products: { "prod-1": "annual" },
  });
});

test("o mapa de IDs vence nome e valor", () => {
  const byProduct = resolvePlan(
    { productId: "prod-anual", productName: "CompensAI Mensal", amount: 14.9 },
    MAP,
  );
  assert.deepEqual(byProduct, { plan: "annual", source: "product_map" });

  const byOffer = resolvePlan(
    { offerId: "oferta-anual", productId: "prod-mensal", amount: 14.9 },
    MAP,
  );
  assert.deepEqual(byOffer, { plan: "annual", source: "offer_map" });
});

test("sem ID mapeado, detecta o plano pelo nome do produto", () => {
  assert.equal(detectPlan({ productName: "CompensAI Anual" }), "annual");
  assert.equal(detectPlan({ productName: "CompensAI Mensal" }), "monthly");
  assert.equal(detectPlan({ offerName: "Assinatura anual premium" }), "annual");
  assert.equal(resolvePlan({ productName: "CompensAI Mensal" }, MAP).source, "name");
});

test("sem nome reconhecível, detecta o plano pelo valor pago (só BRL)", () => {
  assert.equal(detectPlan({ productName: "Acesso", amount: 99.9, currency: "BRL" }), "annual");
  assert.equal(detectPlan({ productName: "Acesso", amount: 14.9, currency: "BRL" }), "monthly");
  assert.equal(detectPlan({ productName: "Acesso", amount: null }), null);
  assert.equal(detectPlan({ productName: "Acesso", amount: 99.9, currency: "USD" }), null);
  assert.equal(ANNUAL_PRICE_THRESHOLD_CENTS, 5740);
});

test("compra aprovada libera o plano identificado e guarda só dados do pedido", () => {
  const update = mapCaktoEvent("purchase_approved", approvedData(), null, NOW, MAP);
  assert.equal(update.kind, "grant");
  if (update.kind !== "grant") return;
  assert.equal(update.plan, "monthly");
  assert.equal(update.expires_at, iso(NOW + 30 * DAY));
  assert.equal(update.payment.amount_cents, 1490);
  assert.equal(update.payment.currency, "BRL");
  assert.equal(update.payment.product_id, "prod-mensal");
  assert.equal(update.payment.offer_id, "oferta-mensal");
  assert.equal(update.payment.transaction_id, "trx-1");
  assert.equal(update.payment.approved_at, iso(NOW));
});

test("pagamento sem plano identificável não é concedido (unmapped)", () => {
  const update = mapCaktoEvent(
    "purchase_approved",
    { id: "trx-sem-plano", product: { id: "prod-desconhecido", name: "Outro produto" } },
    null,
    NOW,
    MAP,
  );
  assert.equal(update.kind, "unmapped");
});

test("assinatura renovada estende o período existente", () => {
  const current = sub({ plan: "annual", expires_at: iso(NOW + 20 * DAY) });
  const update = mapCaktoEvent(
    "subscription_renewed",
    approvedData({
      id: "trx-2",
      amount: 99.9,
      product: { id: "prod-anual", name: "CompensAI Anual" },
    }),
    current,
    NOW,
    MAP,
  );
  assert.equal(update.kind, "grant");
  if (update.kind !== "grant") return;
  assert.equal(update.plan, "annual");
  assert.equal(update.expires_at, iso(NOW + 385 * DAY));
});

test("reembolso e chargeback revogam", () => {
  assert.equal(mapCaktoEvent("refund", { amount: 14.9 }, sub(), NOW, MAP).kind, "revoke");
  assert.equal(mapCaktoEvent("chargeback", { amount: 14.9 }, sub(), NOW, MAP).kind, "revoke");
});

test("cancelamento preserva o fim do período pago", () => {
  const current = sub({ expires_at: iso(NOW + 12 * DAY) });
  const update = mapCaktoEvent("subscription_canceled", {}, current, NOW, MAP);
  assert.equal(update.kind, "cancel");
  if (update.kind !== "cancel") return;
  assert.equal(update.expires_at, iso(NOW + 12 * DAY));
});

test("atraso, pausa e retomada têm cada um a sua regra", () => {
  assert.equal(mapCaktoEvent("subscription_late", {}, sub(), NOW, MAP).kind, "late");
  assert.equal(mapCaktoEvent("subscription_renewal_refused", {}, sub(), NOW, MAP).kind, "late");
  assert.equal(mapCaktoEvent("subscription_paused", {}, sub(), NOW, MAP).kind, "pause");
  assert.equal(mapCaktoEvent("subscription_resumed", {}, sub(), NOW, MAP).kind, "resume");
});

test("pagamento recusado não cancela uma assinatura existente", () => {
  const update = mapCaktoEvent("purchase_refused", approvedData(), sub(), NOW, MAP);
  assert.equal(update.kind, "ignore");
});

test("eventos sem efeito no acesso são ignorados", () => {
  for (const event of [
    "checkout_abandonment",
    "pix_gerado",
    "boleto_gerado",
    "refund_requested",
    "dispute_defense_requested",
    "purchase_email_failed",
    "initiate_checkout",
    "evento_novo_desconhecido",
  ]) {
    assert.equal(mapCaktoEvent(event, {}, sub(), NOW, MAP).kind, "ignore", event);
  }
});

test("eventos de ruído do checkout não entram no log", () => {
  assert.equal(isNoiseEvent("checkout_abandonment"), true);
  assert.equal(isNoiseEvent("pix_gerado"), true);
  assert.equal(isNoiseEvent("purchase_approved"), false);
  assert.equal(isNoiseEvent("refund"), false);
});

/* ------------------------------------------- aplicação e idempotência */

function apply(
  billing: StoredBilling,
  event: string,
  data: Record<string, unknown> | null,
  map: PlanMap = MAP,
  nowMs = NOW,
) {
  return applyEventToBilling({ billing, event, data, nowMs, planMap: map });
}

test("evento aprovado grava assinatura ativa e marca o evento como processado", () => {
  const outcome = apply(
    { trial_started_at: iso(NOW - 3 * DAY) },
    "purchase_approved",
    approvedData(),
  );
  const billing = outcome.billing;
  assert.equal(outcome.applied, true);
  assert.equal(outcome.result, "granted");
  assert.ok(billing.subscription);
  assert.equal(billing.subscription?.status, "active");
  assert.equal(billing.subscription?.plan, "monthly");
  assert.equal(billing.subscription?.payment?.transaction_id, "trx-1");
  assert.deepEqual(billing.processed_events, ["purchase_approved:trx-1"]);
  assert.equal(billing.trial_started_at, iso(NOW - 3 * DAY));
  assert.equal(billing.events?.length, 1);
  assert.equal(computeEntitlement(billing, NOW).has_access, true);
});

test("o log não guarda nome nem e-mail do comprador", () => {
  const outcome = apply({}, "purchase_approved", approvedData());
  const serialized = JSON.stringify(outcome.billing);
  assert.equal(serialized.includes("comprador@exemplo.com"), false);
  assert.equal(serialized.includes("Fulano"), false);
  assert.equal(serialized.includes("customer"), false);
});

test("idempotência: o mesmo pedido não estende o acesso duas vezes", () => {
  const first = apply({}, "purchase_approved", approvedData());
  const expires = first.billing.subscription?.expires_at;
  const second = apply(first.billing, "purchase_approved", approvedData());

  assert.equal(second.applied, false);
  assert.equal(second.result, "duplicate");
  assert.equal(second.billing.subscription?.expires_at, expires);
  assert.equal(second.billing.processed_events?.length, 1);
  assert.equal(second.billing.events?.length, 2);
  assert.equal(second.billing.events?.at(-1)?.result, "duplicate");
});

test("idempotência: renovação repetida não soma dois períodos", () => {
  const bought = apply({}, "purchase_approved", approvedData()).billing;
  const renewalData = approvedData({ id: "trx-renovacao-1" });
  const first = apply(bought, "subscription_renewed", renewalData);
  const expires = first.billing.subscription?.expires_at;
  const second = apply(first.billing, "subscription_renewed", renewalData);
  assert.equal(second.result, "duplicate");
  assert.equal(second.billing.subscription?.expires_at, expires);
});

test("evento sem plano mapeado não é marcado como processado (permite reenvio)", () => {
  const data = { id: "trx-9", product: { id: "prod-anual", name: "Produto Premium" } };
  const first = apply({}, "purchase_approved", data, {});
  assert.equal(first.result, "unmapped");
  assert.equal(first.applied, false);
  assert.equal(first.billing.subscription, undefined);
  assert.equal(first.billing.processed_events, undefined);

  const retry = apply(first.billing, "purchase_approved", data, MAP);
  assert.equal(retry.result, "granted");
  assert.equal(retry.billing.subscription?.plan, "annual");
});

test("reembolso zera o acesso no registro persistido", () => {
  const afterBuy = apply({}, "purchase_approved", approvedData({ amount: 99.9 })).billing;
  assert.equal(computeEntitlement(afterBuy, NOW + DAY).has_access, true);

  const refund = apply(afterBuy, "refund", { id: "trx-1" }, MAP, NOW + DAY);
  assert.equal(refund.result, "revoked");
  assert.equal(refund.billing.subscription?.status, "refunded");
  assert.equal(computeEntitlement(refund.billing, NOW + DAY).has_access, false);
});

test("chargeback revoga na hora", () => {
  const afterBuy = apply({}, "purchase_approved", approvedData()).billing;
  const chargeback = apply(afterBuy, "chargeback", { id: "trx-1" }, MAP, NOW + DAY);
  assert.equal(chargeback.result, "revoked");
  assert.equal(chargeback.billing.subscription?.status, "chargeback");
  assert.equal(computeEntitlement(chargeback.billing, NOW + DAY).has_access, false);
});

test("cancelamento mantém o período pago e depois bloqueia", () => {
  const afterBuy = apply({}, "purchase_approved", approvedData()).billing;
  const canceled = apply(afterBuy, "subscription_canceled", { id: "trx-1" }, MAP, NOW + DAY);
  assert.equal(canceled.result, "canceled");
  assert.equal(canceled.billing.subscription?.expires_at, iso(NOW + 30 * DAY));
  assert.equal(computeEntitlement(canceled.billing, NOW + 2 * DAY).has_access, true);
  assert.equal(computeEntitlement(canceled.billing, NOW + 31 * DAY).has_access, false);
});

test("atraso não inventa período e pausa suspende até a retomada", () => {
  const afterBuy = apply({}, "purchase_approved", approvedData()).billing;
  const late = apply(afterBuy, "subscription_late", { id: "trx-1" }, MAP, NOW + DAY);
  assert.equal(late.billing.subscription?.status, "late");
  assert.equal(computeEntitlement(late.billing, NOW + 2 * DAY).has_access, true);
  assert.equal(computeEntitlement(late.billing, NOW + 31 * DAY).has_access, false);

  const paused = apply(late.billing, "subscription_paused", {}, MAP, NOW + 2 * DAY);
  assert.equal(paused.billing.subscription?.status, "paused");
  assert.equal(computeEntitlement(paused.billing, NOW + 2 * DAY).has_access, false);

  const resumed = apply(paused.billing, "subscription_resumed", {}, MAP, NOW + 3 * DAY);
  assert.equal(resumed.billing.subscription?.status, "active");
  assert.equal(computeEntitlement(resumed.billing, NOW + 3 * DAY).has_access, true);
});

test("pagamento recusado é registrado mas não altera o acesso", () => {
  const outcome = apply({ trial_started_at: iso(NOW - HOUR) }, "purchase_refused", approvedData());
  assert.equal(outcome.result, "ignored");
  assert.equal(outcome.billing.subscription, undefined);
  assert.equal(outcome.billing.events?.at(-1)?.result, "ignored");
  assert.equal(computeEntitlement(outcome.billing, NOW).has_access, true);
});

test("o log de eventos é limitado", () => {
  let billing: StoredBilling = {};
  for (let i = 0; i < MAX_EVENT_LOG + 12; i += 1) {
    billing = apply(billing, "refund_requested", { id: `req-${i}` }).billing;
  }
  assert.equal(billing.events?.length, MAX_EVENT_LOG);
});

test("o registro de eventos processados é limitado", () => {
  let billing: StoredBilling = {};
  for (let i = 0; i < 60; i += 1) {
    billing = apply(billing, "refund_requested", { id: `req-${i}` }).billing;
  }
  assert.equal(billing.processed_events?.length, 50);
});

test("idempotência: chave usa o id do pedido e nunca o e-mail", () => {
  const data = approvedData();
  assert.equal(eventKey("purchase_approved", data), "purchase_approved:trx-1");
  const semId = eventKey("checkout_abandonment", {
    customerEmail: "a@b.com",
    createdAt: "2026-10-31T12:00:00Z",
  });
  assert.equal(semId.includes("a@b.com"), false);
});

test("paymentFromData não carrega dados pessoais", () => {
  const payment = paymentFromData(approvedData());
  assert.deepEqual(Object.keys(payment).sort(), [
    "amount_cents",
    "approved_at",
    "currency",
    "offer_id",
    "offer_name",
    "product_id",
    "product_name",
    "transaction_id",
  ]);
  // Valor da oferta é usado quando `amount` não vem no topo.
  assert.equal(paymentFromData({ offer: { price: 99.9 } }).amount_cents, 9990);
});

/* ------------------------------------------------------------- "Meu plano" */

test("resumo do plano mostra nome, situação, validade e tipo de acesso", () => {
  const trial = planSummary(computeEntitlement({ trial_started_at: iso(NOW) }, NOW));
  assert.equal(trial.planName, "Teste gratuito");
  assert.equal(trial.statusLabel, "Teste gratuito ativo");
  assert.equal(trial.accessLabel, "Acesso gratuito");
  assert.equal(trial.tone, "free");
  assert.match(trial.validityLabel, /^Até /);

  const paid = planSummary(computeEntitlement({ subscription: sub({ plan: "annual" }) }, NOW));
  assert.equal(paid.planName, "CompensAI Anual");
  assert.equal(paid.statusLabel, "Assinatura ativa");
  assert.equal(paid.accessLabel, "Acesso pago");
  assert.equal(paid.tone, "paid");
  assert.match(paid.validityLabel, /^Válido até /);

  const canceled = planSummary(
    computeEntitlement(
      { subscription: sub({ status: "canceled", expires_at: iso(NOW - DAY) }) },
      NOW,
    ),
  );
  assert.equal(canceled.statusLabel, "Assinatura cancelada");
  assert.equal(canceled.accessLabel, "Acesso cancelado");
  assert.equal(canceled.tone, "blocked");

  const expired = planSummary(computeEntitlement({ trial_started_at: iso(NOW - 5 * DAY) }, NOW));
  assert.equal(expired.statusLabel, "Teste gratuito encerrado");
  assert.equal(expired.accessLabel, "Acesso expirado");

  const refunded = planSummary(
    computeEntitlement({ subscription: sub({ status: "refunded" }) }, NOW),
  );
  assert.equal(refunded.statusLabel, "Pagamento reembolsado");
  assert.equal(refunded.accessLabel, "Acesso revogado");

  const paused = planSummary(computeEntitlement({ subscription: sub({ status: "paused" }) }, NOW));
  assert.equal(paused.statusLabel, "Assinatura pausada");
  assert.equal(paused.accessLabel, "Acesso suspenso");
});

test("descrição do estado é legível", () => {
  const trial = computeEntitlement({ trial_started_at: iso(NOW) }, NOW);
  assert.match(describeEntitlement(trial), /Teste grátis ativo/);
  assert.match(describeEntitlement(trial), /48h/);

  const active = computeEntitlement({ subscription: sub({ plan: "annual" }) }, NOW);
  assert.match(describeEntitlement(active), /Plano anual ativo até/);

  const expired = computeEntitlement({ trial_started_at: iso(NOW - 5 * DAY) }, NOW);
  assert.equal(describeEntitlement(expired), "Teste gratuito encerrado");

  assert.match(
    describeEntitlement(computeEntitlement({ subscription: sub({ status: "late" }) }, NOW)),
    /Renovação em atraso/,
  );
  assert.equal(
    describeEntitlement(computeEntitlement({ subscription: sub({ status: "paused" }) }, NOW)),
    "Assinatura pausada",
  );
});

test("tempo restante formatado", () => {
  assert.equal(formatRemaining(48), "48h");
  assert.equal(formatRemaining(8.5), "8h 30min");
  assert.equal(formatRemaining(0.5), "30 min");
  assert.equal(formatRemaining(0), "0 min");
});

/* ------------------------------------------------- token do checkout Cakto */

test("token de callback identifica usuário e plano", async () => {
  const userId = "4b8f8b1e-6d6c-4c7e-9f6a-1d2c3b4a5e6f";
  const token = await signCallbackToken(userId, "annual", SECRET);
  const verified = await verifyCallbackToken(token, SECRET);
  assert.deepEqual(verified, { userId, plan: "annual" });
});

test("token adulterado é recusado", async () => {
  const userId = "4b8f8b1e-6d6c-4c7e-9f6a-1d2c3b4a5e6f";
  const token = await signCallbackToken(userId, "monthly", SECRET);
  const [payload] = token.split(".");
  const forgedPayload = Buffer.from(`c1.${userId}.annual`, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  assert.equal(await verifyCallbackToken(`${forgedPayload}.${token.split(".")[1]}`, SECRET), null);
  assert.equal(await verifyCallbackToken(`${payload}.${"0".repeat(32)}`, SECRET), null);
});

test("token assinado com outro segredo é recusado", async () => {
  const token = await signCallbackToken("user-1", "annual", SECRET);
  assert.equal(await verifyCallbackToken(token, "outro-segredo-qualquer"), null);
  assert.equal(await verifyCallbackToken("lixo", SECRET), null);
  assert.equal(await verifyCallbackToken("", SECRET), null);
});

test("link de checkout recebe o token em ?callback=", () => {
  const url = buildCheckoutUrl("annual", "abc.def");
  assert.equal(url, "https://pay.cakto.com.br/893demw?callback=abc.def");
  assert.equal(buildCheckoutUrl("monthly", null), PLANS.monthly.checkoutUrl);
});

/* -------------------------------------------------- assinatura do webhook */

test("aceita assinatura HMAC válida e recusa inválida", async () => {
  const rawBody = JSON.stringify({ secret: SECRET, event: "purchase_approved", data: { id: "1" } });
  const timestamp = String(Math.floor(NOW / 1000));
  const signature = `v1=${await hmacHex(SECRET, `${timestamp}.${rawBody}`)}`;

  assert.equal(
    await verifyWebhookSignature({ rawBody, timestamp, signature, secret: SECRET, nowMs: NOW }),
    true,
  );
  assert.equal(
    await verifyWebhookSignature({
      rawBody,
      timestamp,
      signature: `v1=${"a".repeat(64)}`,
      secret: SECRET,
      nowMs: NOW,
    }),
    false,
  );
  assert.equal(
    await verifyWebhookSignature({
      rawBody,
      timestamp,
      signature,
      secret: "outro-segredo",
      nowMs: NOW,
    }),
    false,
  );
});

test("recusa entrega antiga (replay) e cabeçalho ausente", async () => {
  const rawBody = JSON.stringify({ event: "purchase_approved" });
  const timestamp = String(Math.floor((NOW - 6 * 60 * 1000) / 1000));
  const signature = `v1=${await hmacHex(SECRET, `${timestamp}.${rawBody}`)}`;
  assert.equal(
    await verifyWebhookSignature({ rawBody, timestamp, signature, secret: SECRET, nowMs: NOW }),
    false,
  );
  assert.equal(
    await verifyWebhookSignature({
      rawBody,
      timestamp: null,
      signature: null,
      secret: SECRET,
      nowMs: NOW,
    }),
    false,
  );
  assert.equal(
    await verifyWebhookSignature({
      rawBody,
      timestamp: "abc",
      signature,
      secret: SECRET,
      nowMs: NOW,
    }),
    false,
  );
});

test("tolerância de 5 minutos aceita entrega recente", async () => {
  const rawBody = "{}";
  const timestamp = String(Math.floor((NOW - 4 * 60 * 1000) / 1000));
  const signature = `v1=${await hmacHex(SECRET, `${timestamp}.${rawBody}`)}`;
  assert.equal(
    await verifyWebhookSignature({ rawBody, timestamp, signature, secret: SECRET, nowMs: NOW }),
    true,
  );
});

/* ------------------------------------------------------------------ runner */

let passed = 0;
const failures: string[] = [];

for (const [name, fn] of cases) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    failures.push(`${name} → ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} teste(s) falharam:\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`\n${passed} casos de assinatura/trial passaram.`);

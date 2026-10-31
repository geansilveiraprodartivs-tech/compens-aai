// Testes do teste gratuito de 48 horas + assinaturas Cakto do CompensAI.
//
// Roda com:  node scripts/subscription.test.ts
//
// Nenhum pagamento real é feito: o webhook é exercitado apenas com payloads
// sintéticos e assinaturas HMAC calculadas localmente.

import assert from "node:assert/strict";
import {
  ANNUAL_MONTHLY_EQUIVALENT_CENTS,
  ANNUAL_SAVINGS_CENTS,
  GATE_SUBTITLE,
  GATE_TITLE,
  PLANS,
  TRIAL_MS,
  applyBillingUpdate,
  buildCheckoutUrl,
  computeEntitlement,
  describeEntitlement,
  detectPlan,
  eventKey,
  formatBRL,
  formatRemaining,
  hmacHex,
  mapCaktoEvent,
  nextExpiry,
  signCallbackToken,
  verifyCallbackToken,
  verifyWebhookSignature,
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
  // 12 × 14,90 = 178,80 ; 178,80 − 99,90 = 78,90
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
  // Simula logout/login: mesmo registro persistido, relógio mais tarde.
  const segundo = computeEntitlement({ trial_started_at: primeiro.trial_started_at! }, NOW + 40 * HOUR + 60_000);
  assert.equal(segundo.trial_started_at, startedAt);
  assert.equal(segundo.state, "trial");
  assert.ok((segundo.trial_hours_remaining ?? 0) < 8);
  // Reinstalar também não zera: o marco fica no servidor, não no aparelho.
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
    {
      trial_started_at: iso(NOW),
      subscription: sub({ status: "pending", expires_at: null }),
    },
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
  const expires = nextExpiry(iso(NOW + 10 * DAY), "monthly", NOW);
  assert.equal(expires, iso(NOW + 40 * DAY));
});

test("compra depois de expirado começa a contar de agora", () => {
  assert.equal(nextExpiry(iso(NOW - 5 * DAY), "monthly", NOW), iso(NOW + 30 * DAY));
  assert.equal(nextExpiry(null, "annual", NOW), iso(NOW + 365 * DAY));
});

/* ------------------------------------------------------- plano do webhook */

test("detecta o plano pelo nome do produto", () => {
  assert.equal(detectPlan({ productName: "CompensAI Anual" }), "annual");
  assert.equal(detectPlan({ productName: "CompensAI Mensal" }), "monthly");
  assert.equal(detectPlan({ offerName: "Assinatura anual premium" }), "annual");
});

test("detecta o plano pelo valor pago quando o nome não ajuda", () => {
  assert.equal(detectPlan({ productName: "Acesso", amount: 99.9, currency: "BRL" }), "annual");
  assert.equal(detectPlan({ productName: "Acesso", amount: 14.9, currency: "BRL" }), "monthly");
  assert.equal(detectPlan({ productName: "Acesso", amount: null }), null);
  assert.equal(detectPlan({ productName: "Acesso", amount: 99.9, currency: "USD" }), null);
});

test("eventos de compra aprovada concedem o plano", () => {
  const update = mapCaktoEvent(
    "purchase_approved",
    { product: { name: "CompensAI Anual" }, amount: 99.9, currency: "BRL" },
    null,
    NOW,
  );
  assert.equal(update.kind, "grant");
  if (update.kind !== "grant") return;
  assert.equal(update.plan, "annual");
  assert.equal(update.expires_at, iso(NOW + 365 * DAY));
});

test("assinatura renovada estende o período existente", () => {
  const current = sub({ plan: "annual", expires_at: iso(NOW + 20 * DAY) });
  const update = mapCaktoEvent("subscription_renewed", { amount: 99.9 }, current, NOW);
  assert.equal(update.kind, "grant");
  if (update.kind !== "grant") return;
  assert.equal(update.expires_at, iso(NOW + 385 * DAY));
});

test("reembolso e chargeback revogam", () => {
  assert.equal(mapCaktoEvent("refund", { amount: 14.9 }, sub(), NOW).kind, "revoke");
  assert.equal(mapCaktoEvent("chargeback", { amount: 14.9 }, sub(), NOW).kind, "revoke");
});

test("cancelamento preserva o fim do período pago", () => {
  const current = sub({ expires_at: iso(NOW + 12 * DAY) });
  const update = mapCaktoEvent("subscription_canceled", {}, current, NOW);
  assert.equal(update.kind, "cancel");
  if (update.kind !== "cancel") return;
  assert.equal(update.expires_at, iso(NOW + 12 * DAY));
});

test("atraso/recusa marcam como pendente (sem liberar)", () => {
  const update = mapCaktoEvent("subscription_late", { amount: 14.9 }, sub(), NOW);
  assert.equal(update.kind, "pending");
  const refused = mapCaktoEvent("purchase_refused", { amount: 14.9 }, null, NOW);
  assert.equal(refused.kind, "pending");
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
    assert.equal(mapCaktoEvent(event, {}, sub(), NOW).kind, "ignore", event);
  }
});

test("evento aprovado grava assinatura ativa e marca o evento como processado", () => {
  const update = mapCaktoEvent(
    "purchase_approved",
    { product: { name: "CompensAI Mensal" }, amount: 14.9 },
    null,
    NOW,
  );
  const billing = applyBillingUpdate({ trial_started_at: iso(NOW - 3 * DAY) }, update, iso(NOW), "purchase_approved:abc");
  assert.ok(billing.subscription);
  assert.equal(billing.subscription?.status, "active");
  assert.equal(billing.subscription?.plan, "monthly");
  assert.deepEqual(billing.processed_events, ["purchase_approved:abc"]);
  assert.equal(billing.trial_started_at, iso(NOW - 3 * DAY));
  assert.equal(computeEntitlement(billing, NOW).has_access, true);
});

test("idempotência: mesmo pedido gera a mesma chave de evento", () => {
  const data = { id: "pedido-1", refId: "X1", customer: { email: "a@b.com" } };
  assert.equal(eventKey("purchase_approved", data), "purchase_approved:pedido-1");
  assert.equal(
    eventKey("checkout_abandonment", { customerEmail: "a@b.com", createdAt: "2026-10-31T12:00:00Z" }),
    "checkout_abandonment:a@b.com:2026-10-31T12:00:00Z",
  );
});

test("revogação zera o acesso no registro persistido", () => {
  const grant = mapCaktoEvent("purchase_approved", { amount: 99.9 }, null, NOW);
  const afterBuy = applyBillingUpdate({}, grant, iso(NOW), "purchase_approved:1");
  assert.equal(computeEntitlement(afterBuy, NOW + DAY).has_access, true);

  const revoke = mapCaktoEvent("refund", { amount: 99.9 }, afterBuy.subscription!, NOW + DAY);
  const afterRefund = applyBillingUpdate(afterBuy, revoke, iso(NOW + DAY), "refund:1");
  assert.equal(computeEntitlement(afterRefund, NOW + DAY).has_access, false);
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
    await verifyWebhookSignature({ rawBody, timestamp, signature: `v1=${"a".repeat(64)}`, secret: SECRET, nowMs: NOW }),
    false,
  );
  assert.equal(
    await verifyWebhookSignature({ rawBody, timestamp, signature, secret: "outro-segredo", nowMs: NOW }),
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
    await verifyWebhookSignature({ rawBody, timestamp: null, signature: null, secret: SECRET, nowMs: NOW }),
    false,
  );
  assert.equal(
    await verifyWebhookSignature({ rawBody, timestamp: "abc", signature, secret: SECRET, nowMs: NOW }),
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

/* ---------------------------------------------------------------- textos */

test("descrição do estado é legível", () => {
  const trial = computeEntitlement({ trial_started_at: iso(NOW) }, NOW);
  assert.match(describeEntitlement(trial), /Teste grátis ativo/);
  assert.match(describeEntitlement(trial), /48h/);

  const active = computeEntitlement({ subscription: sub({ plan: "annual" }) }, NOW);
  assert.match(describeEntitlement(active), /Plano anual ativo até/);

  const expired = computeEntitlement({ trial_started_at: iso(NOW - 5 * DAY) }, NOW);
  assert.equal(describeEntitlement(expired), "Teste gratuito encerrado");
});

test("tempo restante formatado", () => {
  assert.equal(formatRemaining(48), "48h");
  assert.equal(formatRemaining(8.5), "8h 30min");
  assert.equal(formatRemaining(0.5), "30 min");
  assert.equal(formatRemaining(0), "0 min");
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

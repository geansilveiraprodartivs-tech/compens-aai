// Testes do webhook da Cakto (CompensAI).
//
// Roda com:  node scripts/caktoWebhook.test.ts
//
// O handler é exercitado com dependências em memória: nenhum banco, nenhuma
// rede, nenhum pagamento real. A assinatura HMAC é calculada localmente.

import assert from "node:assert/strict";
import {
  handleCaktoWebhook,
  handleCaktoWebhookInfo,
  type WebhookDeps,
} from "../src/lib/cakto-webhook.server.ts";
import {
  applyEventToBilling,
  computeEntitlement,
  hmacHex,
  parsePlanMap,
  type PlanMap,
  type StoredBilling,
} from "../src/lib/entitlement.ts";
import type { WebhookApplyResult } from "../src/lib/entitlement.server.ts";

const NOW = Date.parse("2026-10-31T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const SECRET = "segredo-do-webhook-cakto-para-teste";
const EMAIL = "cliente@exemplo.com";
const USER_ID = "user-1";

const MAP: PlanMap = parsePlanMap(
  '{"products":{"prod-anual":"annual","prod-mensal":"monthly"},"offers":{"oferta-anual":"annual"}}',
);

const cases: Array<[string, () => Promise<void>]> = [];

function test(name: string, fn: () => Promise<void>) {
  cases.push([name, fn]);
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Payload de pedido no formato da Cakto (inclui PII que não deve ser guardada). */
function order(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "trx-100",
    refId: "ref-100",
    status: "approved",
    amount: 14.9,
    currency: "BRL",
    createdAt: iso(NOW),
    paidAt: iso(NOW),
    product: { id: "prod-mensal", name: "CompensAI Mensal" },
    offer: { id: "oferta-mensal", name: "Assinatura Mensal", price: 14.9 },
    customer: { email: EMAIL, name: "Cliente Teste" },
    ...overrides,
  };
}

type Harness = {
  deps: WebhookDeps;
  billing: Map<string, StoredBilling>;
  calls: { resolve: number; apply: number };
};

/** “Banco” em memória: aplica as mesmas regras puras que o servidor aplica. */
function harness(
  options: { planMap?: PlanMap; failApply?: boolean; secret?: string | null } = {},
): Harness {
  const knownUsers = new Map<string, string>([[EMAIL, USER_ID]]);
  const billing = new Map<string, StoredBilling>([
    [USER_ID, { trial_started_at: iso(NOW - 3 * DAY) }],
  ]);
  const calls = { resolve: 0, apply: 0 };

  const deps: WebhookDeps = {
    secret: options.secret === undefined ? SECRET : options.secret,
    now: () => NOW,
    resolveUser: async ({ callback, email }) => {
      calls.resolve += 1;
      if (callback === "token-assinado-do-user-1") return USER_ID;
      if (!email) return null;
      return knownUsers.get(email.toLowerCase()) ?? null;
    },
    apply: async (userId, event, data) => {
      calls.apply += 1;
      if (options.failApply) throw new Error("falha simulada no banco");
      const outcome = applyEventToBilling({
        billing: billing.get(userId) ?? {},
        event,
        data,
        nowMs: NOW,
        planMap: options.planMap ?? MAP,
      });
      billing.set(userId, outcome.billing);
      const result: WebhookApplyResult = {
        applied: outcome.applied,
        result: outcome.result,
        reason: outcome.reason,
      };
      if (outcome.plan) result.plan = outcome.plan;
      if (outcome.plan_source) result.plan_source = outcome.plan_source;
      return result;
    },
  };

  return { deps, billing, calls };
}

type DeliveryOptions = {
  /** Segredo usado para ASSINAR (para simular assinatura inválida). */
  signWith?: string;
  timestamp?: number;
  signature?: string | null;
};

async function delivery(
  payload: Record<string, unknown>,
  options: DeliveryOptions = {},
): Promise<Request> {
  const rawBody = JSON.stringify(payload);
  const timestamp = options.timestamp ?? Math.floor(NOW / 1000);
  const signature =
    options.signature === undefined
      ? `v1=${await hmacHex(options.signWith ?? SECRET, `${timestamp}.${rawBody}`)}`
      : options.signature;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-cakto-timestamp": String(timestamp),
  };
  if (signature) headers["x-cakto-signature"] = signature;

  return new Request("https://app.test/api/public/cakto", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

function payload(event: string, data: unknown, secret = SECRET): Record<string, unknown> {
  return { secret, event, data };
}

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/* --------------------------------------------------------------- rota GET */

test("GET /api/public/cakto confirma o endpoint", async () => {
  const res = handleCaktoWebhookInfo();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await body(res), { ok: true, endpoint: "cakto" });
});

/* --------------------------------------------------------------- segurança */

test("sem CAKTO_WEBHOOK_SECRET nada é aceito (fail closed)", async () => {
  const h = harness({ secret: null });
  const res = await handleCaktoWebhook(
    await delivery(payload("purchase_approved", order())),
    h.deps,
  );
  assert.equal(res.status, 401);
  assert.equal((await body(res))["error"], "webhook_not_configured");
  assert.equal(h.calls.apply, 0);
});

test("assinatura HMAC inválida é recusada sem processar o evento", async () => {
  const h = harness();
  const res = await handleCaktoWebhook(
    await delivery(payload("purchase_approved", order()), { signWith: "segredo-errado" }),
    h.deps,
  );
  assert.equal(res.status, 401);
  assert.equal((await body(res))["error"], "invalid_signature");
  assert.equal(h.calls.resolve, 0);
  assert.equal(h.calls.apply, 0);
});

test("entrega sem cabeçalho de assinatura é recusada", async () => {
  const h = harness();
  const res = await handleCaktoWebhook(
    await delivery(payload("purchase_approved", order()), { signature: null }),
    h.deps,
  );
  assert.equal(res.status, 401);
  assert.equal(h.calls.apply, 0);
});

test("replay antigo (fora dos 5 minutos) é recusado", async () => {
  const h = harness();
  const res = await handleCaktoWebhook(
    await delivery(payload("purchase_approved", order()), {
      timestamp: Math.floor((NOW - 10 * 60 * 1000) / 1000),
    }),
    h.deps,
  );
  assert.equal(res.status, 401);
  assert.equal(h.calls.apply, 0);
});

test("secret do corpo diferente do configurado é recusado", async () => {
  const h = harness();
  const res = await handleCaktoWebhook(
    await delivery(payload("purchase_approved", order(), "segredo-do-corpo-errado")),
    h.deps,
  );
  assert.equal(res.status, 401);
  assert.equal((await body(res))["error"], "invalid_secret");
  assert.equal(h.calls.apply, 0);
});

test("aceita assinatura adicional durante rotação de segredo", async () => {
  const h = harness();
  const rawBody = JSON.stringify(payload("purchase_approved", order()));
  const timestamp = Math.floor(NOW / 1000);
  const valid = `v1=${await hmacHex(SECRET, `${timestamp}.${rawBody}`)}`;
  const res = await handleCaktoWebhook(
    await delivery(payload("purchase_approved", order()), {
      signature: `v1=${"0".repeat(64)}, ${valid}`,
    }),
    h.deps,
  );
  assert.equal(res.status, 200);
  assert.equal((await body(res))["applied"], 1);
});

test("JSON inválido responde 400 sem processar", async () => {
  const h = harness();
  const rawBody = "{ isto não é json";
  const timestamp = Math.floor(NOW / 1000);
  const signature = `v1=${await hmacHex(SECRET, `${timestamp}.${rawBody}`)}`;
  const res = await handleCaktoWebhook(
    new Request("https://app.test/api/public/cakto", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cakto-timestamp": String(timestamp),
        "x-cakto-signature": signature,
      },
      body: rawBody,
    }),
    h.deps,
  );
  assert.equal(res.status, 400);
  assert.equal((await body(res))["error"], "invalid_json");
  assert.equal(h.calls.apply, 0);
});

test("evento ausente responde 400", async () => {
  const h = harness();
  const res = await handleCaktoWebhook(await delivery({ secret: SECRET, data: order() }), h.deps);
  assert.equal(res.status, 400);
  assert.equal((await body(res))["error"], "missing_event");
});

/* --------------------------------------------------------------- pagamento */

test("compra aprovada libera o plano e registra a transação", async () => {
  const h = harness();
  const res = await handleCaktoWebhook(
    await delivery(payload("purchase_approved", order())),
    h.deps,
  );
  assert.equal(res.status, 200);
  const data = await body(res);
  assert.equal(data["ok"], true);
  assert.equal(data["applied"], 1);
  assert.equal(data["failed"], 0);

  const billing = h.billing.get(USER_ID)!;
  assert.equal(billing.subscription?.status, "active");
  assert.equal(billing.subscription?.plan, "monthly");
  assert.equal(billing.subscription?.payment?.transaction_id, "trx-100");
  assert.equal(billing.subscription?.payment?.amount_cents, 1490);
  assert.equal(billing.subscription?.payment?.approved_at, iso(NOW));
  assert.equal(computeEntitlement(billing, NOW).has_access, true);
});

test("plano anual mapeado por ID do produto libera 365 dias", async () => {
  const h = harness();
  const res = await handleCaktoWebhook(
    await delivery(
      payload(
        "purchase_approved",
        order({
          id: "trx-anual",
          amount: 99.9,
          product: { id: "prod-anual", name: "CompensAI Anual" },
        }),
      ),
    ),
    h.deps,
  );
  assert.equal(res.status, 200);
  const billing = h.billing.get(USER_ID)!;
  assert.equal(billing.subscription?.plan, "annual");
  assert.equal(billing.subscription?.expires_at, iso(NOW + 365 * DAY));
});

test("comprador desconhecido não recebe acesso", async () => {
  const h = harness();
  const res = await handleCaktoWebhook(
    await delivery(
      payload("purchase_approved", order({ customer: { email: "ninguem@exemplo.com" } })),
    ),
    h.deps,
  );
  assert.equal(res.status, 200);
  const data = await body(res);
  assert.equal(data["applied"], 0);
  assert.equal(data["unknownUser"], 1);
  assert.equal(h.billing.get(USER_ID)?.subscription, undefined);
});

test("pedido sem e-mail usa o token de callback do checkout", async () => {
  const h = harness();
  const res = await handleCaktoWebhook(
    await delivery(
      payload(
        "purchase_approved",
        order({
          id: "trx-callback",
          callback: "token-assinado-do-user-1",
          customer: { email: "outro@exemplo.com" },
        }),
      ),
    ),
    h.deps,
  );
  assert.equal(res.status, 200);
  assert.equal((await body(res))["applied"], 1);
  assert.equal(h.billing.get(USER_ID)?.subscription?.status, "active");
});

test("pedido sem e-mail nem callback é contado como conta não encontrada", async () => {
  const h = harness();
  const res = await handleCaktoWebhook(
    await delivery(payload("purchase_approved", { id: "trx-sem-dono", amount: 14.9 })),
    h.deps,
  );
  assert.equal(res.status, 200);
  assert.equal((await body(res))["unknownUser"], 1);
  assert.equal(h.calls.apply, 0);
});

test("webhook V2 com lista de pedidos processa todos os itens", async () => {
  const h = harness();
  const res = await handleCaktoWebhook(
    await delivery(
      payload("purchase_approved", [
        order(),
        order({ id: "trx-bump", product: { id: "prod-mensal", name: "CompensAI Mensal" } }),
      ]),
    ),
    h.deps,
  );
  assert.equal(res.status, 200);
  const data = await body(res);
  assert.equal(data["applied"], 2);
  // Dois meses somados a partir do primeiro pagamento.
  assert.equal(h.billing.get(USER_ID)?.subscription?.expires_at, iso(NOW + 60 * DAY));
});

test("evento repetido não estende o acesso novamente", async () => {
  const h = harness();
  const first = await body(
    await handleCaktoWebhook(await delivery(payload("purchase_approved", order())), h.deps),
  );
  const expires = h.billing.get(USER_ID)?.subscription?.expires_at;

  const second = await body(
    await handleCaktoWebhook(await delivery(payload("purchase_approved", order())), h.deps),
  );

  assert.equal(first["applied"], 1);
  assert.equal(second["applied"], 0);
  assert.equal(second["skipped"], 1);
  assert.equal(second["ok"], true);
  assert.equal(h.billing.get(USER_ID)?.subscription?.expires_at, expires);
});

/* ------------------------------------------------------------ assinaturas */

test("renovação estende o período existente", async () => {
  const h = harness();
  await handleCaktoWebhook(await delivery(payload("purchase_approved", order())), h.deps);
  const res = await handleCaktoWebhook(
    await delivery(payload("subscription_renewed", order({ id: "trx-renovacao" }))),
    h.deps,
  );
  assert.equal(res.status, 200);
  assert.equal((await body(res))["applied"], 1);
  const billing = h.billing.get(USER_ID)!;
  assert.equal(billing.subscription?.expires_at, iso(NOW + 60 * DAY));
  assert.equal(computeEntitlement(billing, NOW + 45 * DAY).has_access, true);
});

test("reembolso revoga o acesso", async () => {
  const h = harness();
  await handleCaktoWebhook(await delivery(payload("purchase_approved", order())), h.deps);
  const res = await handleCaktoWebhook(
    await delivery(payload("refund", order({ status: "refunded" }))),
    h.deps,
  );
  assert.equal(res.status, 200);
  assert.equal((await body(res))["applied"], 1);
  const billing = h.billing.get(USER_ID)!;
  assert.equal(billing.subscription?.status, "refunded");
  assert.equal(computeEntitlement(billing, NOW).has_access, false);
});

test("chargeback revoga o acesso", async () => {
  const h = harness();
  await handleCaktoWebhook(await delivery(payload("purchase_approved", order())), h.deps);
  const res = await handleCaktoWebhook(
    await delivery(payload("chargeback", order({ status: "chargeback" }))),
    h.deps,
  );
  assert.equal(res.status, 200);
  assert.equal((await body(res))["applied"], 1);
  const billing = h.billing.get(USER_ID)!;
  assert.equal(billing.subscription?.status, "chargeback");
  assert.equal(computeEntitlement(billing, NOW).has_access, false);
});

test("cancelamento mantém o acesso até o fim do período pago", async () => {
  const h = harness();
  await handleCaktoWebhook(await delivery(payload("purchase_approved", order())), h.deps);
  const res = await handleCaktoWebhook(
    await delivery(payload("subscription_canceled", order({ status: "canceled" }))),
    h.deps,
  );
  assert.equal(res.status, 200);
  const billing = h.billing.get(USER_ID)!;
  assert.equal(billing.subscription?.status, "canceled");
  assert.equal(billing.subscription?.expires_at, iso(NOW + 30 * DAY));
  assert.equal(computeEntitlement(billing, NOW + DAY).has_access, true);
  assert.equal(computeEntitlement(billing, NOW + 31 * DAY).has_access, false);
});

test("atraso, pausa e retomada da assinatura", async () => {
  const h = harness();
  await handleCaktoWebhook(await delivery(payload("purchase_approved", order())), h.deps);

  await handleCaktoWebhook(await delivery(payload("subscription_late", order())), h.deps);
  assert.equal(h.billing.get(USER_ID)?.subscription?.status, "late");
  assert.equal(computeEntitlement(h.billing.get(USER_ID)!, NOW + DAY).has_access, true);

  await handleCaktoWebhook(await delivery(payload("subscription_paused", order())), h.deps);
  assert.equal(h.billing.get(USER_ID)?.subscription?.status, "paused");
  assert.equal(computeEntitlement(h.billing.get(USER_ID)!, NOW).has_access, false);

  const resumed = await handleCaktoWebhook(
    await delivery(payload("subscription_resumed", order())),
    h.deps,
  );
  assert.equal(resumed.status, 200);
  assert.equal(h.billing.get(USER_ID)?.subscription?.status, "active");
  assert.equal(computeEntitlement(h.billing.get(USER_ID)!, NOW).has_access, true);
});

/* --------------------------------------------------------- casos de borda */

test("evento de plano não identificado não libera e permite reenvio", async () => {
  const h = harness({ planMap: {} });
  const data = order({
    id: "trx-premium",
    amount: null,
    product: { id: "prod-premium", name: "Produto Premium" },
    offer: null,
  });

  const first = await body(
    await handleCaktoWebhook(await delivery(payload("purchase_approved", data)), h.deps),
  );
  assert.equal(first["ok"], true);
  assert.equal(first["applied"], 0);
  assert.equal(first["skipped"], 1);
  assert.equal(first["unmapped"], 1);
  assert.equal(h.billing.get(USER_ID)?.subscription, undefined);

  // Depois de configurar o mapa, o mesmo evento pode ser reenviado.
  const h2 = harness({ planMap: parsePlanMap('{"products":{"prod-premium":"annual"}}') });
  h2.billing.set(USER_ID, h.billing.get(USER_ID)!);
  const retry = await body(
    await handleCaktoWebhook(await delivery(payload("purchase_approved", data)), h2.deps),
  );
  assert.equal(retry["applied"], 1);
  assert.equal(h2.billing.get(USER_ID)?.subscription?.status, "active");
});

test("eventos de ruído respondem 200 sem varrer contas", async () => {
  const h = harness();
  const res = await handleCaktoWebhook(
    await delivery(payload("checkout_abandonment", { customer: { email: EMAIL } })),
    h.deps,
  );
  assert.equal(res.status, 200);
  const data = await body(res);
  assert.equal(data["ok"], true);
  assert.equal(data["ignored"], 1);
  assert.equal(h.calls.resolve, 0);
  assert.equal(h.calls.apply, 0);
});

test("entrega sem pedido responde 200 sem efeito", async () => {
  const h = harness();
  const res = await handleCaktoWebhook(await delivery(payload("purchase_approved", null)), h.deps);
  assert.equal(res.status, 200);
  assert.equal((await body(res))["ignored"], 0);
  assert.equal(h.calls.apply, 0);
});

test("falha ao gravar responde 500 para a Cakto reenviar", async () => {
  const h = harness({ failApply: true });
  const res = await handleCaktoWebhook(
    await delivery(payload("purchase_approved", order())),
    h.deps,
  );
  assert.equal(res.status, 500);
  const data = await body(res);
  assert.equal(data["ok"], false);
  assert.equal(data["failed"], 1);
  assert.equal(data["error"], "processing_failed");
  // A resposta não pode vazar detalhes internos/segredos.
  assert.equal(JSON.stringify(data).includes("falha simulada"), false);
  assert.equal(JSON.stringify(data).includes(SECRET), false);
});

test("respostas nunca incluem o segredo", async () => {
  const h = harness();
  const res = await handleCaktoWebhook(
    await delivery(payload("purchase_approved", order())),
    h.deps,
  );
  const text = JSON.stringify(await body(res));
  assert.equal(text.includes(SECRET), false);
  assert.equal(text.includes(EMAIL), false);
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

console.log(`\n${passed} casos do webhook da Cakto passaram.`);

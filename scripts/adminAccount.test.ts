// Testes da conta administrativa (selo Premium vitalício).
//
// Roda com:  node scripts/adminAccount.test.ts
//
// Nada aqui acessa rede ou banco: as funções testadas são puras. A aplicação do
// selo no servidor (`getEntitlementForUser`) usa exatamente estas funções.

import assert from "node:assert/strict";
import {
  ADMIN_ACCOUNT_EMAILS,
  PREMIUM_ACCOUNT,
  isAdminEmail,
  normalizeAccountEmail,
} from "../src/lib/adminAccount.ts";
import {
  computeEntitlement,
  describeEntitlement,
  grantAdminAccess,
  planSummary,
  type Entitlement,
  type StoredBilling,
} from "../src/lib/entitlement.ts";

const cases: Array<[string, () => void | Promise<void>]> = [];

function test(name: string, fn: () => void | Promise<void>) {
  cases.push([name, fn]);
}

const NOW = Date.parse("2026-11-03T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function trialBilling(startedAtMs: number): StoredBilling {
  return { trial_started_at: iso(startedAtMs), rev: 1 };
}

/* ------------------------------------------------ 1. quem é administrador */

test("admin: a conta configurada é reconhecida", () => {
  assert.equal(isAdminEmail("geansilveiraprodartivs@gmail.com"), true);
});

test("admin: lista tem exatamente a conta pedida e nada mais", () => {
  assert.equal(ADMIN_ACCOUNT_EMAILS.length, 1);
  assert.equal(normalizeAccountEmail(ADMIN_ACCOUNT_EMAILS[0]), "geansilveiraprodartivs@gmail.com");
});

test("admin: maiúsculas, espaços e apelido do Gmail continuam sendo a mesma conta", () => {
  assert.equal(isAdminEmail("  GeanSilveiraProdArtivs@Gmail.com "), true);
  assert.equal(isAdminEmail("geansilveiraprodartivs+adm@gmail.com"), true);
  assert.equal(isAdminEmail("gean.silveiraprodartivs@gmail.com"), true);
  assert.equal(isAdminEmail("geansilveiraprodartivs+teste2@googlemail.com"), true);
});

test("admin: outra caixa de entrada NÃO vira administrador", () => {
  for (const email of [
    "geansilveiraprodartivs@hotmail.com",
    "geansilveiraprodartivs2@gmail.com",
    "outro@gmail.com",
    "gean.silveira@gmail.com",
    "geansilveira@gmail.com",
  ]) {
    assert.equal(isAdminEmail(email), false, `não deveria ser admin: ${email}`);
  }
});

test("admin: entradas inválidas não viram administrador", () => {
  for (const value of [
    "",
    "   ",
    "sem-arroba",
    "a@b",
    "@gmail.com",
    "a@@b.com",
    null,
    42,
    {},
    [],
  ]) {
    assert.equal(isAdminEmail(value), false, `não deveria ser admin: ${String(value)}`);
  }
  assert.equal(normalizeAccountEmail("a".repeat(250) + "@gmail.com"), "");
});

/* -------------------------------- 2. o selo garante acesso mesmo sem trial */

test("admin: trial vencido continua com acesso premium", () => {
  const expired = computeEntitlement(trialBilling(NOW - 10 * DAY), NOW);
  assert.equal(expired.has_access, false, "sem o selo, o trial vencido bloqueia");

  const admin = grantAdminAccess(expired);
  assert.equal(admin.state, "admin");
  assert.equal(admin.has_access, true);
  assert.equal(admin.admin, true);
  assert.equal(admin.payment_pending, false);
});

test("admin: assinatura reembolsada/contestada não tira o acesso do dono", () => {
  const refunded: StoredBilling = {
    trial_started_at: iso(NOW - 10 * DAY),
    subscription: {
      plan: "monthly",
      status: "refunded",
      started_at: iso(NOW - 20 * DAY),
      expires_at: iso(NOW - 5 * DAY),
      updated_at: iso(NOW - 5 * DAY),
    },
  };
  const base = computeEntitlement(refunded, NOW);
  assert.equal(base.has_access, false);
  assert.equal(grantAdminAccess(base).has_access, true);
});

test("admin: o histórico do trial continua visível (nada é apagado)", () => {
  const start = NOW - 2 * HOUR;
  const admin = grantAdminAccess(computeEntitlement(trialBilling(start), NOW));
  assert.equal(admin.trial_started_at, iso(start));
  assert.equal(admin.trial_ends_at, iso(start + 48 * HOUR));
  assert.equal(admin.plan, null);
  assert.equal(admin.status, null);
});

test("admin: o selo não transforma quem não é admin em premium", () => {
  const normal = computeEntitlement(trialBilling(NOW - 10 * DAY), NOW);
  assert.equal(normal.admin ?? false, false);
  assert.equal(normal.has_access, false);
});

/* ----------------------------------------- 3. textos do selo no perfil/app */

test("admin: resumo do plano mostra Premium vitalício", () => {
  const admin = grantAdminAccess(computeEntitlement(trialBilling(NOW - 10 * DAY), NOW));
  const summary = planSummary(admin);
  assert.equal(summary.planName, "Administrador");
  assert.equal(summary.statusLabel, "Conta administrativa");
  assert.equal(summary.accessLabel, "Premium vitalício");
  assert.equal(summary.validityLabel, "Vitalício, sem prazo");
  assert.equal(summary.tone, "premium");
});

test("admin: descrição curta identifica a conta administrativa", () => {
  const admin: Entitlement = grantAdminAccess(
    computeEntitlement(trialBilling(NOW - 10 * DAY), NOW),
  );
  assert.match(describeEntitlement(admin), /administrativa/i);
  assert.match(describeEntitlement(admin), /vital/i);
});

test("admin: textos do selo existem e são curtos", () => {
  assert.equal(PREMIUM_ACCOUNT.badge, "Premium");
  assert.equal(PREMIUM_ACCOUNT.role, "Fundador");
  assert.ok(PREMIUM_ACCOUNT.title.length > 3);
  assert.ok(PREMIUM_ACCOUNT.body.includes("vitalício"));
  assert.equal(PREMIUM_ACCOUNT.perks.length, 3);
});

/* ------------------------------------------------------------------ runner */

let passed = 0;
const failures: string[] = [];

for (const [name, fn] of cases) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    failures.push(`${name} -> ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} teste(s) falharam:\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`\n${passed} casos da conta administrativa passaram.`);

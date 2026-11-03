// Testes da oferta de teste grátis de 48 horas (página inicial) e das travas
// de cadastro que impedem um segundo período de avaliação.
//
// Roda com:  node scripts/trialOffer.test.ts
//
// Nada aqui acessa rede ou banco: as funções testadas são puras.

import assert from "node:assert/strict";
import {
  SIGNUP_ALREADY_EXISTS_MESSAGE,
  TRIAL_OFFER,
  TRIAL_OFFER_BENEFITS,
  TRIAL_OFFER_HOURS,
  authModeFromSearch,
  isSameSignupMailbox,
  normalizeSignupEmail,
  signupSearch,
} from "../src/lib/trialOffer.ts";
import {
  TRIAL_HOURS,
  TRIAL_MS,
  computeEntitlement,
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

/* ------------------------------------------------- 1. texto pedido na oferta */

test("oferta: título exato solicitado", () => {
  assert.equal(TRIAL_OFFER.title, "Experimente o CompensAI gratuitamente por 48 horas!");
});

test("oferta: parágrafo exato solicitado", () => {
  assert.equal(
    TRIAL_OFFER.body,
    "Tenha acesso a todas as funcionalidades do aplicativo durante 48 horas e descubra como é mais fácil cuidar da sua alimentação, organizar suas compras e acompanhar seus objetivos.",
  );
});

test("oferta: aviso de teste sem limitações", () => {
  assert.equal(
    TRIAL_OFFER.note,
    "Teste grátis, sem limitações de funcionalidades durante o período de avaliação.",
  );
});

test("oferta: rótulos dos dois botões de cadastro", () => {
  assert.equal(TRIAL_OFFER.emailCta, "Criar cadastro com e-mail e senha");
  assert.equal(TRIAL_OFFER.googleCta, "Continuar com Google");
});

test("oferta: opção discreta para quem já tem conta", () => {
  assert.equal(TRIAL_OFFER.existingAccountLabel, "Já tenho uma conta?");
  assert.equal(TRIAL_OFFER.existingAccountCta, "Entrar");
});

test("oferta: 48 horas é a mesma regra do entitlement (fonte única)", () => {
  assert.equal(TRIAL_OFFER_HOURS, 48);
  assert.equal(TRIAL_OFFER_HOURS, TRIAL_HOURS);
  assert.equal(TRIAL_MS, TRIAL_OFFER_HOURS * HOUR);
});

test("oferta: benefícios não prometem nada fora do trial", () => {
  assert.equal(TRIAL_OFFER_BENEFITS.length, 3);
  for (const benefit of TRIAL_OFFER_BENEFITS) {
    assert.ok(benefit.length > 10 && benefit.length <= 90, `texto inesperado: ${benefit}`);
  }
});

/* -------------------------------------- 2. o botão abre CADASTRO, não login */

test("link: botão de e-mail abre /auth?modo=cadastro", () => {
  assert.deepEqual(signupSearch(), { modo: "cadastro" });
});

test("link: ?modo=cadastro abre no modo de cadastro", () => {
  assert.equal(authModeFromSearch({ modo: "cadastro" }), "signup");
});

test("link: sem parâmetro abre no login (comportamento antigo)", () => {
  assert.equal(authModeFromSearch(undefined), "signin");
  assert.equal(authModeFromSearch({}), "signin");
  assert.equal(authModeFromSearch({ modo: "" }), "signin");
});

test("link: parâmetro desconhecido não vira cadastro por acidente", () => {
  assert.equal(authModeFromSearch({ modo: "qualquer" }), "signin");
  assert.equal(authModeFromSearch({ modo: 42 }), "signin");
  assert.equal(authModeFromSearch({ modo: ["cadastro"] }), "signin");
  assert.equal(authModeFromSearch(null), "signin");
  assert.equal(authModeFromSearch("cadastro"), "signin");
});

test("link: variações aceitas de cadastro e de recuperação", () => {
  assert.equal(authModeFromSearch({ modo: " CADASTRO " }), "signup");
  assert.equal(authModeFromSearch({ modo: "signup" }), "signup");
  assert.equal(authModeFromSearch({ modo: "recuperar" }), "reset");
  assert.equal(authModeFromSearch({ modo: "reset" }), "reset");
});

test("link: valores hostis não lançam exceção", () => {
  assert.doesNotThrow(() => authModeFromSearch({ modo: {} }));
  assert.doesNotThrow(() => authModeFromSearch(123));
  assert.doesNotThrow(() => authModeFromSearch([1, 2, 3]));
});

/* ------------------------------- 3. uma caixa de e-mail = um único teste grátis */

test("cadastro: normaliza maiúsculas, espaços e apelido +tag", () => {
  assert.equal(normalizeSignupEmail("  Fulano@Exemplo.com "), "fulano@exemplo.com");
  assert.equal(normalizeSignupEmail("fulano+teste2@exemplo.com"), "fulano@exemplo.com");
  assert.equal(normalizeSignupEmail("fulano+@exemplo.com"), "fulano@exemplo.com");
});

test("cadastro: pontos do Gmail são a mesma caixa; em outros domínios contam", () => {
  assert.equal(normalizeSignupEmail("fu.lano@gmail.com"), "fulano@gmail.com");
  assert.equal(normalizeSignupEmail("fu.lano@googlemail.com"), "fulano@googlemail.com");
  assert.equal(normalizeSignupEmail("fu.lano@exemplo.com"), "fu.lano@exemplo.com");
});

test("cadastro: mesmo apelido é reconhecido pela função de comparação", () => {
  assert.equal(
    isSameSignupMailbox("fulano+1@gmail.com", "F.U.LANO@gmail.com"),
    true,
    "apelido/pontos do Gmail precisam ser a mesma caixa",
  );
  assert.equal(isSameSignupMailbox("fulano@exemplo.com", "fulano+2@exemplo.com"), true);
  assert.equal(isSameSignupMailbox("fulano@exemplo.com", "outro@exemplo.com"), false);
  assert.equal(isSameSignupMailbox("fulano@gmail.com", "fulano@outro.com"), false);
});

test("cadastro: entradas inválidas ou vazias nunca bloqueiam ninguém", () => {
  for (const value of ["", "   ", "sem-arroba", "a@b", "@exemplo.com", "a@@b.com", null, 12]) {
    assert.equal(normalizeSignupEmail(value), "", `deveria ser vazio: ${String(value)}`);
  }
  assert.equal(normalizeSignupEmail("a".repeat(250) + "@exemplo.com"), "");
  assert.equal(isSameSignupMailbox("", ""), false);
  assert.equal(isSameSignupMailbox("sem-arroba", "sem-arroba"), false);
});

test("cadastro: mensagem de bloqueio manda entrar com a conta existente", () => {
  assert.match(SIGNUP_ALREADY_EXISTS_MESSAGE, /Já existe uma conta/);
  assert.match(SIGNUP_ALREADY_EXISTS_MESSAGE, /Entre com sua senha/);
});

/* ------------------- 4. as 48h são do servidor e não reiniciam com novo login */

function trialBilling(startedAtMs: number): StoredBilling {
  return { trial_started_at: iso(startedAtMs), rev: 1 };
}

test("trial: 48 horas exatas a partir do início gravado no servidor", () => {
  const start = NOW - 47 * HOUR;
  const e = computeEntitlement(trialBilling(start), NOW);
  assert.equal(e.state, "trial");
  assert.equal(e.has_access, true);
  assert.equal(e.trial_started_at, iso(start));
  assert.equal(e.trial_ends_at, iso(start + TRIAL_MS));
  assert.ok(
    Math.abs((e.trial_hours_remaining ?? 0) - 1) < 0.001,
    "deve restar 1 hora depois de 47 horas",
  );
});

test("trial: passa de 48 horas e o acesso fecha sozinho", () => {
  const start = NOW - 49 * HOUR;
  const e = computeEntitlement(trialBilling(start), NOW);
  assert.equal(e.state, "trial_expired");
  assert.equal(e.has_access, false);
  assert.equal(e.trial_ends_at, iso(start + TRIAL_MS));
  assert.equal(e.trial_hours_remaining, null);
});

test("trial: sair e entrar de novo (nova leitura) não reinicia o período", () => {
  const start = NOW - 30 * HOUR;
  const billing = trialBilling(start);

  // Primeira leitura: 18h restantes.
  const first = computeEntitlement(billing, NOW);
  // "Logout/login" 6 horas depois: o billing lido do servidor é o mesmo.
  const later = computeEntitlement(billing, NOW + 6 * HOUR);
  // E 40 horas depois o trial acabou, com o MESMO início.
  const expired = computeEntitlement(billing, NOW + 40 * HOUR);

  assert.equal(first.trial_started_at, iso(start));
  assert.equal(later.trial_started_at, iso(start));
  assert.equal(expired.trial_started_at, iso(start));
  assert.equal(first.trial_ends_at, later.trial_ends_at);
  assert.equal(later.trial_ends_at, expired.trial_ends_at);
  assert.equal(first.has_access, true);
  assert.equal(later.has_access, true);
  assert.equal(expired.has_access, false);
});

test("trial: conta sem trial gravado não tem acesso até o servidor gravar", () => {
  const e = computeEntitlement({}, NOW);
  assert.equal(e.trial_started_at, null);
  assert.equal(e.trial_ends_at, null);
  assert.equal(e.has_access, false);
  assert.equal(e.state, "trial_expired");
});

test("trial: data inválida no metadata não libera acesso", () => {
  const e = computeEntitlement({ trial_started_at: "ontem" }, NOW);
  assert.equal(e.has_access, false);
  assert.equal(e.state, "trial_expired");
});

test("trial: trial vencido + nenhuma assinatura nunca volta a liberar", () => {
  const e = computeEntitlement(trialBilling(NOW - 10 * DAY), NOW);
  assert.equal(e.state, "trial_expired");
  assert.equal(e.has_access, false);
  assert.equal(e.plan, null);
  assert.equal(e.status, null);
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

console.log(`\n${passed} casos da oferta de teste grátis passaram.`);

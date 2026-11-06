// Testes da confirmação de celular por SMS (Twilio Verify).
//
// Roda com:  node scripts/phoneVerification.test.ts
//
// Nenhuma rede real é usada: o `fetch` é injetado e só registra as chamadas.
// Nenhuma conta real é tocada: o estado é um objeto em memória. Nenhuma
// credencial real aparece aqui — os valores são fictícios, com o mesmo formato
// dos verdadeiros, para provar que nada vaza na resposta nem no log.

import assert from "node:assert/strict";
import {
  PHONE_CODE_TTL_SECONDS,
  PHONE_LOCK_SECONDS,
  PHONE_MAX_CHECK_ATTEMPTS,
  PHONE_MAX_SENDS_PER_WINDOW,
  PHONE_META_KEY,
  PHONE_RESEND_COOLDOWN_SECONDS,
  evaluateCheck,
  evaluateSend,
  formatRetryAfter,
  invalidPhoneMessage,
  lockedState,
  maskPhone,
  nextFailedAttempt,
  nextSendState,
  nextVerifiedState,
  parsePhone,
  phoneGateApplies,
  phoneVerificationRequired,
  readPhoneState,
  type PhoneInvalidReason,
  type PhoneVerificationState,
} from "../src/lib/phoneVerification.ts";
import {
  checkPhoneVerification,
  getPhoneStatusForUser,
  handleTwilioStatus,
  mapTwilioError,
  readTwilioConfig,
  startPhoneVerification,
  twilioConfigStatus,
  type PhoneVerificationDeps,
  type TwilioConfig,
} from "../src/lib/phoneVerification.server.ts";

const cases: Array<[string, () => void | Promise<void>]> = [];

function test(name: string, fn: () => void | Promise<void>) {
  cases.push([name, fn]);
}

/* ------------------------------------------------------------------- dados */

const NOW = Date.parse("2026-11-03T18:00:00.000Z");
const PHONE = "+5551985839571";
const OTHER_PHONE = "+5551999998888";
const USER = "user-1";
const OTHER_USER = "user-2";

const ACCOUNT_SID = `AC${"a".repeat(32)}`;
const SERVICE_SID = `VA${"b".repeat(32)}`;
const API_KEY = `SK${"c".repeat(32)}`;
const CUSTOM_API_KEY = `SK${"d".repeat(32)}`;
/** Valor fictício, só para provar que nunca vaza. */
const API_KEY_SECRET = "segredo-ficticio-da-api-key";
const AUTH_TOKEN = "token-ficticio-da-conta";
/** Valor típico injetado pelo conector Lovable: não é um API Key SID SK... */
const CONNECTOR_KEY = "chave-interna-do-conector-lovable";

const CONFIG: TwilioConfig = {
  accountSid: ACCOUNT_SID,
  verifyServiceSid: SERVICE_SID,
  username: API_KEY,
  password: API_KEY_SECRET,
  authMode: "api_key",
};

const BASE_ENV: Record<string, string | undefined> = {
  TWILIO_ACCOUNT_SID: ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: AUTH_TOKEN,
  TWILIO_API_KEY: API_KEY,
  TWILIO_API_KEY_SECRET: API_KEY_SECRET,
  TWILIO_VERIFY_SERVICE_SID: SERVICE_SID,
};

const ENV_KEYS = [
  ...Object.keys(BASE_ENV),
  "TWILIO_CUSTOM_API_KEY",
  "TWILIO_VERIFY_SERVICE",
  "TWILIO_SERVICE_SID",
  "PHONE_VERIFICATION_REQUIRED",
];

const ORIGINAL_ENV = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function withEnv(env: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  return async () => {
    restoreEnv();
    for (const key of ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) process.env[key] = value;
    }
    try {
      await fn();
    } finally {
      restoreEnv();
    }
  };
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function state(partial: Partial<PhoneVerificationState> = {}): PhoneVerificationState {
  return {
    phone: PHONE,
    verified_at: null,
    last_sent_at: iso(NOW - 5_000),
    sends: [],
    attempts: 0,
    locked_until: null,
    ...partial,
  };
}

type Call = {
  url: string;
  method: string;
  body: string | null;
  authorization: string | null;
};

type FakeResponse = { status?: number; body?: unknown };

function fakeFetch(handler?: (call: Call) => FakeResponse) {
  const calls: Call[] = [];
  const impl = async (url: string, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const call: Call = {
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
      authorization: headers.get("authorization"),
    };
    calls.push(call);
    const result = handler ? handler(call) : { status: 200, body: {} };
    return new Response(JSON.stringify(result.body ?? {}), {
      status: result.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, impl };
}

type Overrides = Partial<PhoneVerificationDeps> & { entitlement_state?: string | null };

function deps(overrides: Overrides = {}): Overrides {
  return {
    config: CONFIG,
    missing: [],
    fetchImpl: fakeFetch().impl,
    loadState: async () => null,
    saveState: async () => undefined,
    findVerifiedPhoneOwner: async () => null,
    now: () => NOW,
    entitlement_state: null,
    ...overrides,
  };
}

function bodyOf(call: Call): URLSearchParams {
  return new URLSearchParams(call.body ?? "");
}

type JsonObject = Record<string, unknown>;

async function readJson(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

function objectField(value: JsonObject, key: string): JsonObject {
  const found = value[key];
  return found && typeof found === "object" && !Array.isArray(found) ? (found as JsonObject) : {};
}

function captureConsole() {
  const messages: string[] = [];
  const original = { error: console.error, warn: console.warn, log: console.log };
  console.error = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  console.warn = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  console.log = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  return {
    messages,
    restore() {
      console.error = original.error;
      console.warn = original.warn;
      console.log = original.log;
    },
  };
}

/* ------------------------------------------------------- 1. número (E.164) */

test("numero: formatos brasileiros comuns chegam no mesmo E.164", () => {
  const inputs = [
    "(51) 98583-9571",
    "51 98583 9571",
    "51985839571",
    "51 9 8583 9571",
    "+55 51 98583-9571",
    "+5551985839571",
    "0055 51 98583-9571",
  ];
  for (const input of inputs) {
    const parsed = parsePhone(input);
    assert.equal(parsed.ok, true, `recusou "${input}"`);
    if (!parsed.ok) return;
    assert.equal(parsed.e164, PHONE, `E.164 errado para "${input}"`);
    assert.equal(parsed.country_code, "55");
    assert.equal(parsed.national, "51985839571");
  }
});

test("numero: internacional só é aceito com DDI explícito", () => {
  const parsed = parsePhone("+1 415 555 0132");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.e164, "+14155550132");
  assert.equal(parsed.country_code, "1");

  const semDdi = parsePhone("989858395711");
  assert.equal(semDdi.ok, false);
  if (semDdi.ok) return;
  assert.equal(semDdi.reason, "invalid_country");
});

test("numero: recusa vazio, lixo, curto, longo, DDD inexistente e fixo", () => {
  const table: Array<[string, PhoneInvalidReason]> = [
    ["", "empty"],
    ["   ", "empty"],
    ["meu celular", "invalid_characters"],
    ["51 abc 9571", "invalid_characters"],
    ["123", "too_short"],
    ["5133334444", "too_short"],
    ["5198583957", "too_short"],
    ["+55 51 98583 9571 0000", "too_long"],
    ["01985839571", "invalid_ddd"],
    ["51785839571", "not_mobile"],
  ];
  for (const [input, reason] of table) {
    const parsed = parsePhone(input);
    assert.equal(parsed.ok, false, `aceitou "${input}"`);
    if (parsed.ok) return;
    assert.equal(parsed.reason, reason, `motivo errado para "${input}"`);
  }
});

test("numero: entradas que não são texto são tratadas como vazio", () => {
  for (const value of [null, undefined, 42, {}, []]) {
    const parsed = parsePhone(value);
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(parsed.reason, "empty");
  }
});

test("numero: máscara esconde o miolo e não mostra o número inteiro", () => {
  const masked = maskPhone(PHONE);
  assert.equal(masked, "+55 51 •••••9571");
  assert.ok(!masked.includes("985839571"));
  assert.equal(maskPhone("123"), "•••");
});

test("numero: mensagens de número inválido são específicas e não vazias", () => {
  const reasons: PhoneInvalidReason[] = [
    "empty",
    "invalid_characters",
    "too_short",
    "too_long",
    "invalid_ddd",
    "not_mobile",
    "invalid_country",
  ];
  const seen = new Set<string>();
  for (const reason of reasons) {
    const message = invalidPhoneMessage(reason);
    assert.ok(message.length > 10, `mensagem curta para ${reason}`);
    assert.ok(!/\+\d{8,}/.test(message), `mensagem vazou número para ${reason}`);
    seen.add(message);
  }
  assert.equal(seen.size, reasons.length, "mensagens repetidas para motivos diferentes");
});

/* --------------------------------------------------- 2. estado persistido */

test("estado: lê objeto válido e descarta lixo", () => {
  const stored = readPhoneState({
    [PHONE_META_KEY]: {
      phone: PHONE,
      verified_at: iso(NOW),
      last_sent_at: iso(NOW - 1_000),
      sends: [iso(NOW - 1_000), "não é data"],
      attempts: 2,
      locked_until: "2026-11-03T18:10:00.000Z",
    },
  });
  assert.ok(stored);
  assert.equal(stored?.phone, PHONE);
  assert.equal(stored?.verified_at, iso(NOW));
  assert.equal(stored?.sends.length, 1);
  assert.equal(stored?.attempts, 2);

  assert.equal(readPhoneState(null), null);
  assert.equal(readPhoneState("texto"), null);
  assert.equal(readPhoneState({}), null);
  assert.equal(readPhoneState({ [PHONE_META_KEY]: null }), null);
  assert.equal(readPhoneState({ [PHONE_META_KEY]: { phone: "  " } }), null);
});

test("estado: tentativas fora da faixa são normalizadas", () => {
  const negative = readPhoneState({ [PHONE_META_KEY]: { phone: PHONE, attempts: -7 } });
  assert.equal(negative?.attempts, 0);
  const huge = readPhoneState({ [PHONE_META_KEY]: { phone: PHONE, attempts: 9999 } });
  assert.equal(huge?.attempts, 99);
});

/* --------------------------------------------- 3. decisão de envio (antiabuso) */

test("envio: primeira vez é liberado", () => {
  const decision = evaluateSend({ state: null, phone: PHONE, nowMs: NOW });
  assert.deepEqual(decision, { allowed: true, reason: "ok", retry_after_seconds: 0 });
});

test("envio: celular já confirmado nesta conta não pede código de novo", () => {
  const decision = evaluateSend({
    state: state({ verified_at: iso(NOW - 86_400_000) }),
    phone: PHONE,
    nowMs: NOW,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "already_verified");
});

test("envio: outro celular pode ser confirmado na mesma conta", () => {
  const decision = evaluateSend({
    state: state({ verified_at: iso(NOW - 86_400_000), last_sent_at: iso(NOW - 120_000) }),
    phone: OTHER_PHONE,
    nowMs: NOW,
  });
  assert.equal(decision.allowed, true);
});

test("envio: respeita o intervalo de reenvio de 60 segundos", () => {
  const early = evaluateSend({
    state: state({ last_sent_at: iso(NOW - 20_000) }),
    phone: PHONE,
    nowMs: NOW,
  });
  assert.equal(early.allowed, false);
  assert.equal(early.reason, "cooldown");
  assert.equal(early.retry_after_seconds, PHONE_RESEND_COOLDOWN_SECONDS - 20);

  const boundary = evaluateSend({
    state: state({ last_sent_at: iso(NOW - 60_000) }),
    phone: PHONE,
    nowMs: NOW,
  });
  assert.equal(boundary.allowed, true);
});

test("envio: teto de 5 pedidos por hora por conta, mesmo trocando de número", () => {
  const sends = Array.from({ length: PHONE_MAX_SENDS_PER_WINDOW }, (_, index) =>
    iso(NOW - (index + 1) * 60_000),
  );
  const blocked = evaluateSend({
    state: state({ last_sent_at: iso(NOW - 120_000), sends }),
    phone: OTHER_PHONE,
    nowMs: NOW,
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "too_many_sends");
  assert.ok(blocked.retry_after_seconds > 0);

  const oldSends = Array.from({ length: PHONE_MAX_SENDS_PER_WINDOW }, (_, index) =>
    iso(NOW - 2 * 60 * 60_000 - index * 1_000),
  );
  const allowed = evaluateSend({
    state: state({ last_sent_at: iso(NOW - 2 * 60 * 60_000), sends: oldSends }),
    phone: PHONE,
    nowMs: NOW,
  });
  assert.equal(allowed.allowed, true, "pedidos fora da janela não podem bloquear");
});

/* ------------------------------------- 4. decisão de checagem (tentativas) */

test("checagem: sem código pendente não valida nada", () => {
  const decision = evaluateCheck({ state: null, phone: PHONE, nowMs: NOW });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "no_pending");
});

test("checagem: código já usado não serve de novo (reuso bloqueado)", () => {
  const decision = evaluateCheck({
    state: state({ verified_at: iso(NOW - 1_000) }),
    phone: PHONE,
    nowMs: NOW,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "already_verified");
});

test("checagem: só vale para o mesmo número que recebeu o SMS", () => {
  const decision = evaluateCheck({ state: state(), phone: OTHER_PHONE, nowMs: NOW });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "phone_mismatch");
});

test("checagem: expira em 10 minutos", () => {
  const fresh = evaluateCheck({ state: state(), phone: PHONE, nowMs: NOW });
  assert.equal(fresh.allowed, true);
  assert.equal(fresh.attempts_remaining, PHONE_MAX_CHECK_ATTEMPTS);

  const expired = evaluateCheck({
    state: state({ last_sent_at: iso(NOW - (PHONE_CODE_TTL_SECONDS + 1) * 1000) }),
    phone: PHONE,
    nowMs: NOW,
  });
  assert.equal(expired.allowed, false);
  assert.equal(expired.reason, "expired");
});

test("checagem: bloqueia enquanto o prazo do bloqueio não passa", () => {
  const decision = evaluateCheck({
    state: state({ attempts: PHONE_MAX_CHECK_ATTEMPTS, locked_until: iso(NOW + 120_000) }),
    phone: PHONE,
    nowMs: NOW,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "locked");
  assert.equal(decision.retry_after_seconds, 120);
  assert.equal(decision.attempts_remaining, 0);
});

test("checagem: estourar as tentativas bloqueia por 15 minutos", () => {
  const decision = evaluateCheck({
    state: state({ attempts: PHONE_MAX_CHECK_ATTEMPTS, locked_until: iso(NOW - 1_000) }),
    phone: PHONE,
    nowMs: NOW,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "locked");
  assert.equal(decision.retry_after_seconds, PHONE_LOCK_SECONDS);
});

/* ----------------------------------------------------------- 5. redutores */

test("redutores: envio aceito guarda histórico e limpa tentativas", () => {
  const next = nextSendState(state({ attempts: 3, locked_until: iso(NOW + 1_000) }), PHONE, NOW);
  assert.equal(next.phone, PHONE);
  assert.equal(next.last_sent_at, iso(NOW));
  assert.equal(next.attempts, 0);
  assert.equal(next.locked_until, null);
  assert.deepEqual(next.sends, [iso(NOW)]);
});

test("redutores: trocar de número descarta a confirmação anterior", () => {
  const same = nextSendState(state({ verified_at: iso(NOW - 1_000) }), PHONE, NOW);
  assert.equal(same.verified_at, iso(NOW - 1_000));

  const other = nextSendState(state({ verified_at: iso(NOW - 1_000) }), OTHER_PHONE, NOW);
  assert.equal(other.verified_at, null);
});

test("redutores: envios fora da janela saem do histórico", () => {
  const next = nextSendState(
    state({ sends: [iso(NOW - 2 * 60 * 60_000), iso(NOW - 60_000)] }),
    PHONE,
    NOW,
  );
  assert.deepEqual(next.sends, [iso(NOW - 60_000), iso(NOW)]);
});

test("redutores: tentativa errada incrementa e bloqueia no limite", () => {
  let current = state({ attempts: 0 });
  for (let attempt = 1; attempt <= PHONE_MAX_CHECK_ATTEMPTS; attempt += 1) {
    current = nextFailedAttempt(current, NOW);
    assert.equal(current.attempts, attempt);
    if (attempt < PHONE_MAX_CHECK_ATTEMPTS) {
      assert.equal(current.locked_until, null, `bloqueou cedo demais (${attempt})`);
    }
  }
  assert.equal(current.locked_until, iso(NOW + PHONE_LOCK_SECONDS * 1000));
});

test("redutores: confirmação guarda a data e zera o histórico", () => {
  const next = nextVerifiedState(state({ attempts: 2 }), PHONE, NOW);
  assert.equal(next.verified_at, iso(NOW));
  assert.deepEqual(next.sends, []);
  assert.equal(next.attempts, 0);
  assert.equal(next.locked_until, null);
});

test("redutores: bloqueio imediato da Twilio vale 15 minutos", () => {
  const next = lockedState(state(), NOW);
  assert.equal(next.attempts, PHONE_MAX_CHECK_ATTEMPTS);
  assert.equal(next.locked_until, iso(NOW + PHONE_LOCK_SECONDS * 1000));
});

/* ------------------------------------------------- 6. gate de celular */

test("gate: desligado por padrão e só liga com true explícito", () => {
  assert.equal(phoneVerificationRequired({}), false);
  assert.equal(phoneVerificationRequired({ PHONE_VERIFICATION_REQUIRED: "" }), false);
  assert.equal(phoneVerificationRequired({ PHONE_VERIFICATION_REQUIRED: "1" }), false);
  assert.equal(phoneVerificationRequired({ PHONE_VERIFICATION_REQUIRED: "sim" }), false);
  assert.equal(phoneVerificationRequired({ PHONE_VERIFICATION_REQUIRED: "false" }), false);
  assert.equal(phoneVerificationRequired({ PHONE_VERIFICATION_REQUIRED: "true" }), true);
  assert.equal(phoneVerificationRequired({ PHONE_VERIFICATION_REQUIRED: " TRUE " }), true);
});

test("gate: nunca pega conta paga, admin, pagamento pendente ou trial encerrado", () => {
  for (const entitlementState of [
    "active",
    "admin",
    "pending",
    "trial_expired",
    "expired",
    "canceled",
    "blocked",
    null,
    undefined,
  ]) {
    assert.equal(
      phoneGateApplies(entitlementState, true),
      false,
      `gate pegou a situação ${String(entitlementState)}`,
    );
  }
  assert.equal(phoneGateApplies("trial", true), true);
  assert.equal(phoneGateApplies("trial", false), false);
});

/* ------------------------------------------------- 7. configuração Twilio */

test("config: faltando variáveis aponta exatamente os nomes, sem valores", () => {
  const read = readTwilioConfig({});
  assert.equal(read.config, null);
  assert.ok(read.missing.includes("TWILIO_ACCOUNT_SID"));
  assert.ok(read.missing.some((entry) => entry.includes("TWILIO_AUTH_TOKEN")));
  assert.ok(read.missing.includes("TWILIO_VERIFY_SERVICE_SID"));
  assert.deepEqual(read.invalid, []);
});

test("config: Auth Token aceito, API Key tem prioridade quando o par existe", () => {
  const token = readTwilioConfig({
    TWILIO_ACCOUNT_SID: ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: AUTH_TOKEN,
    TWILIO_VERIFY_SERVICE_SID: SERVICE_SID,
  });
  assert.ok(token.config);
  assert.equal(token.config?.authMode, "auth_token");
  assert.equal(token.config?.username, ACCOUNT_SID);
  assert.equal(token.config?.password, AUTH_TOKEN);

  const apiKey = readTwilioConfig(BASE_ENV);
  assert.ok(apiKey.config);
  assert.equal(apiKey.config?.authMode, "api_key");
  assert.equal(apiKey.config?.username, API_KEY);
  assert.equal(apiKey.config?.password, API_KEY_SECRET);

  const halfKey = readTwilioConfig({
    TWILIO_ACCOUNT_SID: ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: AUTH_TOKEN,
    TWILIO_API_KEY: API_KEY,
    TWILIO_VERIFY_SERVICE_SID: SERVICE_SID,
  });
  assert.equal(halfKey.config, null);
  assert.ok(halfKey.missing.includes("TWILIO_API_KEY_SECRET"));
});

test("config: formato inválido é recusado sem revelar o conteúdo", () => {
  const read = readTwilioConfig({
    TWILIO_ACCOUNT_SID: "AC123",
    TWILIO_AUTH_TOKEN: "curto",
    TWILIO_VERIFY_SERVICE_SID: "servico",
  });
  assert.equal(read.config, null);
  assert.ok(read.invalid.includes("TWILIO_ACCOUNT_SID"));
  assert.ok(read.invalid.includes("TWILIO_VERIFY_SERVICE_SID"));
  assert.ok(read.invalid.includes("TWILIO_AUTH_TOKEN"));
  const dump = JSON.stringify(read);
  assert.ok(!dump.includes("AC123"));
  assert.ok(!dump.includes("servico"));
});

test("config: aliases do Service SID são aceitos", () => {
  for (const key of ["TWILIO_VERIFY_SERVICE_SID", "TWILIO_VERIFY_SERVICE", "TWILIO_SERVICE_SID"]) {
    const read = readTwilioConfig({
      TWILIO_ACCOUNT_SID: ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: AUTH_TOKEN,
      [key]: SERVICE_SID,
    });
    assert.ok(read.config, `alias ${key} não foi aceito`);
  }
});

test("config: diagnóstico diz SE está configurado, nunca o valor", () => {
  const status = twilioConfigStatus({ ...BASE_ENV, PHONE_VERIFICATION_REQUIRED: "true" });
  assert.equal(status["configured"], true);
  assert.equal(status["auth_mode"], "api_key");
  assert.equal(status["gate_required"], true);
  const dump = JSON.stringify(status);
  assert.ok(!dump.includes(AUTH_TOKEN));
  assert.ok(!dump.includes(API_KEY_SECRET));
  assert.ok(!dump.includes(SERVICE_SID));
});

/* ------------------------------------------------- 8. erros da Twilio */

test("erros: códigos da Twilio viram motivos tratáveis", () => {
  const table: Array<[number, string]> = [
    [20003, "auth_failed"],
    [20404, "service_not_found"],
    [20429, "rate_limited"],
    [21211, "invalid_phone"],
    [21604, "invalid_phone"],
    [21606, "invalid_phone"],
    [60200, "invalid_phone"],
    [21614, "not_mobile"],
    [21608, "number_not_verified"],
    [21408, "region_not_enabled"],
    [21610, "blocked"],
    [60202, "too_many_attempts"],
    [60203, "rate_limited"],
  ];
  for (const [code, kind] of table) {
    const error = mapTwilioError({ code, message: "erro da twilio" }, 400);
    assert.equal(error.kind, kind, `código ${code}`);
    assert.equal(error.code, code);
  }
});

test("erros: HTTP sem código também é classificado", () => {
  assert.equal(mapTwilioError({}, 401).kind, "auth_failed");
  assert.equal(mapTwilioError({}, 403).kind, "auth_failed");
  assert.equal(mapTwilioError({}, 404).kind, "service_not_found");
  assert.equal(mapTwilioError({}, 429).kind, "rate_limited");
  assert.equal(mapTwilioError({}, 500).kind, "unknown");
  assert.equal(mapTwilioError(null, 502).kind, "unknown");
});

test("erros: mensagem do provedor é saneada (telefone e tamanho)", () => {
  const error = mapTwilioError(
    { code: 21211, message: `O número +5511987654321 não é válido. ${"x".repeat(500)}` },
    400,
  );
  assert.ok(error.message.includes("[número]"));
  assert.ok(!/\d{8,}/.test(error.message), "telefone continuou na mensagem");
  assert.ok(error.message.length <= 240);
});

/* ---------------------------------------------------- 9. envio de código */

test("envio: chama o Verify com o número em E.164 e devolve só o mascarado", async () => {
  const fake = fakeFetch(() => ({ status: 201, body: { status: "pending", sid: "VE123" } }));
  const saved: Array<PhoneVerificationState | null> = [];
  const result = await startPhoneVerification(
    { userId: USER, phone: "(51) 98583-9571" },
    deps({
      fetchImpl: fake.impl,
      saveState: async (_id, next) => {
        saved.push(next);
      },
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.reason, "sent");
  assert.equal(result.retry_after_seconds, PHONE_RESEND_COOLDOWN_SECONDS);
  assert.equal(result.masked_phone, "+55 51 •••••9571");
  assert.ok(!result.message.includes(PHONE), "mensagem mostrou o número inteiro");
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.phone, PHONE);

  assert.equal(fake.calls.length, 1);
  const call = fake.calls[0];
  assert.ok(call);
  assert.equal(call?.method, "POST");
  assert.ok(call?.url.endsWith(`/v2/Services/${SERVICE_SID}/Verifications`));
  assert.ok(call?.url.startsWith("https://verify.twilio.com/"));
  assert.equal(bodyOf(call!).get("To"), PHONE);
  assert.equal(bodyOf(call!).get("Channel"), "sms");
  assert.equal(bodyOf(call!).get("Locale"), "pt-BR");

  // Basic Auth com a API Key — e somente no servidor.
  const expected = Buffer.from(`${API_KEY}:${API_KEY_SECRET}`).toString("base64");
  assert.equal(call?.authorization, `Basic ${expected}`);
  assert.ok(!JSON.stringify(result).includes(API_KEY_SECRET));
});

test("envio: usa Auth Token quando não há par de API Key", async () => {
  const fake = fakeFetch(() => ({ status: 201, body: { status: "pending" } }));
  const result = await startPhoneVerification(
    { userId: USER, phone: PHONE },
    deps({
      fetchImpl: fake.impl,
      config: {
        accountSid: ACCOUNT_SID,
        verifyServiceSid: SERVICE_SID,
        username: ACCOUNT_SID,
        password: AUTH_TOKEN,
        authMode: "auth_token",
      },
    }),
  );
  assert.equal(result.ok, true);
  const expected = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");
  assert.equal(fake.calls[0]?.authorization, `Basic ${expected}`);
});

test("envio: número inválido não chama a Twilio", async () => {
  const fake = fakeFetch();
  const result = await startPhoneVerification(
    { userId: USER, phone: "51785839571" },
    deps({ fetchImpl: fake.impl }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_phone");
  assert.equal(fake.calls.length, 0);
});

test("envio: sem credencial responde not_configured e informa o nome que falta", async () => {
  const log = captureConsole();
  try {
    const fake = fakeFetch();
    const result = await startPhoneVerification(
      { userId: USER, phone: PHONE },
      deps({ fetchImpl: fake.impl, config: null, missing: ["TWILIO_VERIFY_SERVICE_SID"] }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "not_configured");
    assert.equal(fake.calls.length, 0);
    assert.ok(!JSON.stringify(result).includes("TWILIO_"));
    assert.ok(log.messages.some((entry) => entry.includes("TWILIO_VERIFY_SERVICE_SID")));
  } finally {
    log.restore();
  }
});

test("envio: cooldown de 60 s não chama a Twilio de novo", async () => {
  const fake = fakeFetch();
  const result = await startPhoneVerification(
    { userId: USER, phone: PHONE },
    deps({
      fetchImpl: fake.impl,
      loadState: async () => state({ last_sent_at: iso(NOW - 10_000) }),
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cooldown");
  assert.equal(result.retry_after_seconds, 50);
  assert.equal(fake.calls.length, 0);
});

test("envio: celular confirmado em outra conta é recusado antes do SMS", async () => {
  const fake = fakeFetch();
  const result = await startPhoneVerification(
    { userId: USER, phone: PHONE },
    deps({
      fetchImpl: fake.impl,
      findVerifiedPhoneOwner: async () => OTHER_USER,
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "phone_in_use");
  assert.equal(fake.calls.length, 0);
});

test("envio: credencial recusada vira auth_failed sem vazar segredo no log", async () => {
  const log = captureConsole();
  try {
    const fake = fakeFetch(() => ({
      status: 401,
      body: { code: 20003, message: "Authenticate" },
    }));
    const result = await startPhoneVerification(
      { userId: USER, phone: PHONE },
      deps({ fetchImpl: fake.impl }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "not_configured");
    assert.equal(result.provider_error?.kind, "auth_failed");
    const dumped = `${JSON.stringify(result)}\n${log.messages.join("\n")}`;
    assert.ok(!dumped.includes(API_KEY_SECRET), "segredo vazou");
    assert.ok(!dumped.includes(AUTH_TOKEN), "token vazou");
  } finally {
    log.restore();
  }
});

test("envio: número de teste não autorizado é explicado (conta trial da Twilio)", async () => {
  const fake = fakeFetch(() => ({
    status: 400,
    body: { code: 21608, message: "The number +5551985839571 is unverified" },
  }));
  const result = await startPhoneVerification(
    { userId: USER, phone: PHONE },
    deps({ fetchImpl: fake.impl }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider_error");
  assert.equal(result.provider_error?.kind, "number_not_verified");
  assert.match(result.message, /conta de teste da Twilio/);
  assert.ok(!result.message.includes(PHONE));
});

test("envio: falha de rede é tratada e não derruba o app", async () => {
  const result = await startPhoneVerification(
    { userId: USER, phone: PHONE },
    deps({
      fetchImpl: async () => {
        throw new Error(`connect ECONNREFUSED ${PHONE} token=${AUTH_TOKEN}`);
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider_error");
  assert.equal(result.provider_error?.kind, "network");
  assert.ok(!JSON.stringify(result).includes(AUTH_TOKEN));
});

test("envio: SMS já solicitado não vira erro se a gravação do estado falhar", async () => {
  const log = captureConsole();
  try {
    const fake = fakeFetch(() => ({ status: 201, body: { status: "pending" } }));
    const result = await startPhoneVerification(
      { userId: USER, phone: PHONE },
      deps({
        fetchImpl: fake.impl,
        saveState: async () => {
          throw new Error("banco fora");
        },
      }),
    );
    assert.equal(result.ok, true, "a pessoa recebeu o SMS; não podemos dizer que falhou");
    assert.ok(log.messages.some((entry) => entry.includes("não foi salvo")));
  } finally {
    log.restore();
  }
});

/* -------------------------------------------------- 10. confirmação de código */

test("código: aprovado confirma o celular e não devolve o número inteiro", async () => {
  const fake = fakeFetch(() => ({
    status: 200,
    body: { status: "approved", to: PHONE },
  }));
  const saved: Array<PhoneVerificationState | null> = [];
  const result = await checkPhoneVerification(
    { userId: USER, phone: PHONE, code: "123456" },
    deps({
      fetchImpl: fake.impl,
      loadState: async () => state(),
      saveState: async (_id, next) => {
        saved.push(next);
      },
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.verified, true);
  assert.equal(result.reason, "verified");
  assert.equal(saved[0]?.verified_at, iso(NOW));
  assert.deepEqual(saved[0]?.sends, []);

  const call = fake.calls[0];
  assert.ok(call?.url.endsWith(`/v2/Services/${SERVICE_SID}/VerificationCheck`));
  assert.equal(bodyOf(call!).get("To"), PHONE);
  assert.equal(bodyOf(call!).get("Code"), "123456");
  assert.ok(!JSON.stringify(result).includes(PHONE));
});

test("código: errado devolve tentativas restantes e grava a tentativa", async () => {
  const fake = fakeFetch(() => ({ status: 200, body: { status: "pending" } }));
  const saved: Array<PhoneVerificationState | null> = [];
  const result = await checkPhoneVerification(
    { userId: USER, phone: PHONE, code: "000000" },
    deps({
      fetchImpl: fake.impl,
      loadState: async () => state({ attempts: 1 }),
      saveState: async (_id, next) => {
        saved.push(next);
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.verified, false);
  assert.equal(result.reason, "invalid_code");
  assert.equal(result.attempts_remaining, 3);
  assert.equal(saved[0]?.attempts, 2);
  assert.match(result.message, /3 tentativas/);
});

test("código: quinto erro bloqueia por 15 minutos", async () => {
  const fake = fakeFetch(() => ({ status: 200, body: { status: "pending" } }));
  const fakeDeps = deps({
    fetchImpl: fake.impl,
    loadState: async () => state({ attempts: PHONE_MAX_CHECK_ATTEMPTS - 1 }),
  });
  const result = await checkPhoneVerification(
    { userId: USER, phone: PHONE, code: "000000" },
    fakeDeps,
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "locked");
  assert.equal(result.attempts_remaining, 0);
  assert.equal(result.retry_after_seconds, PHONE_LOCK_SECONDS);
});

test("código: Twilio responde 60202 e o bloqueio é registrado", async () => {
  const fake = fakeFetch(() => ({
    status: 400,
    body: { code: 60202, message: "Max check attempts reached" },
  }));
  const saved: Array<PhoneVerificationState | null> = [];
  const result = await checkPhoneVerification(
    { userId: USER, phone: PHONE, code: "000000" },
    deps({
      fetchImpl: fake.impl,
      loadState: async () => state(),
      saveState: async (_id, next) => {
        saved.push(next);
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "locked");
  assert.equal(saved[0]?.attempts, PHONE_MAX_CHECK_ATTEMPTS);
  assert.equal(saved[0]?.locked_until, iso(NOW + PHONE_LOCK_SECONDS * 1000));
});

test("código: expirado, sem pedido, outro número ou já confirmado não chamam a Twilio", async () => {
  const scenarios: Array<[string, PhoneVerificationState | null, string]> = [
    ["expirado", state({ last_sent_at: iso(NOW - 11 * 60_000) }), "expired"],
    ["sem pedido", null, "no_pending"],
    ["outro número", state({ phone: OTHER_PHONE }), "phone_mismatch"],
    ["já confirmado", state({ verified_at: iso(NOW - 1_000) }), "already_verified"],
  ];
  for (const [label, stored, reason] of scenarios) {
    const fake = fakeFetch();
    const result = await checkPhoneVerification(
      { userId: USER, phone: PHONE, code: "123456" },
      deps({ fetchImpl: fake.impl, loadState: async () => stored }),
    );
    assert.equal(result.ok, false, label);
    assert.equal(result.reason, reason, label);
    assert.equal(fake.calls.length, 0, `${label} chamou a Twilio`);
  }
});

test("código: formato inválido não chama a Twilio", async () => {
  for (const code of ["", "abc", "12", "12345678901", "12 34"]) {
    const fake = fakeFetch();
    const result = await checkPhoneVerification(
      { userId: USER, phone: PHONE, code },
      deps({ fetchImpl: fake.impl, loadState: async () => state() }),
    );
    assert.equal(result.ok, false, `aceitou o código "${code}"`);
    assert.equal(result.reason, "invalid_code", `motivo errado para "${code}"`);
    assert.equal(fake.calls.length, 0);
  }
});

test("código: celular confirmado em outra conta cancela a confirmação", async () => {
  const fake = fakeFetch(() => ({ status: 200, body: { status: "approved" } }));
  const saved: Array<PhoneVerificationState | null> = [];
  const result = await checkPhoneVerification(
    { userId: USER, phone: PHONE, code: "123456" },
    deps({
      fetchImpl: fake.impl,
      loadState: async () => state(),
      findVerifiedPhoneOwner: async () => OTHER_USER,
      saveState: async (_id, next) => {
        saved.push(next);
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.verified, false);
  assert.equal(result.reason, "phone_in_use");
  assert.equal(saved.length, 0, "não pode gravar confirmação em número de outra conta");
});

test("código: falha ao gravar a confirmação é reportada como erro", async () => {
  const log = captureConsole();
  try {
    const fake = fakeFetch(() => ({ status: 200, body: { status: "approved" } }));
    const result = await checkPhoneVerification(
      { userId: USER, phone: PHONE, code: "123456" },
      deps({
        fetchImpl: fake.impl,
        loadState: async () => state(),
        saveState: async () => {
          throw new Error("banco fora");
        },
      }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.verified, false);
    assert.equal(result.reason, "provider_error");
  } finally {
    log.restore();
  }
});

/* ------------------------------------------------------------ 11. status */

test("status: trial sem verificação vira gate quando exigido e configurado", async () => {
  const base = deps({ loadState: async () => state({ last_sent_at: null }) });
  const required = await getPhoneStatusForUser(USER, { ...base, entitlement_state: "trial" });
  // Não há env com PHONE_VERIFICATION_REQUIRED nesta chamada: gate desligado.
  assert.equal(required.required, false);
  assert.equal(required.gate_applies, false);
  assert.equal(required.configured, true);
  assert.equal(required.verified, false);
  assert.equal(required.phone_masked, "+55 51 •••••9571");
  assert.equal(required.pending, false);
});

test("status: gate ligado pega trial e não pega assinatura", async () => {
  process.env["PHONE_VERIFICATION_REQUIRED"] = "true";
  try {
    const base = deps({ loadState: async () => state({ last_sent_at: null }) });
    const trial = await getPhoneStatusForUser(USER, { ...base, entitlement_state: "trial" });
    assert.equal(trial.required, true);
    assert.equal(trial.gate_applies, true);

    const active = await getPhoneStatusForUser(USER, { ...base, entitlement_state: "active" });
    assert.equal(active.gate_applies, false);

    const admin = await getPhoneStatusForUser(USER, { ...base, entitlement_state: "admin" });
    assert.equal(admin.gate_applies, false);
  } finally {
    restoreEnv();
  }
});

test("status: gate falha aberto quando a Twilio não está configurada", async () => {
  process.env["PHONE_VERIFICATION_REQUIRED"] = "true";
  try {
    const status = await getPhoneStatusForUser(USER, {
      ...deps({ config: null, missing: ["TWILIO_ACCOUNT_SID"], entitlement_state: "trial" }),
    });
    assert.equal(status.required, true);
    assert.equal(status.configured, false);
    assert.equal(status.gate_applies, false, "ninguém pode ficar preso por falta de credencial");
    assert.deepEqual(status.missing, ["TWILIO_ACCOUNT_SID"]);
  } finally {
    restoreEnv();
  }
});

test("status: conta verificada mostra data e não fica pendente", async () => {
  const status = await getPhoneStatusForUser(USER, {
    ...deps({
      loadState: async () => state({ verified_at: iso(NOW - 60_000) }),
      entitlement_state: "trial",
    }),
  });
  assert.equal(status.verified, true);
  assert.equal(status.pending, false);
  assert.equal(status.verified_at, iso(NOW - 60_000));
  assert.equal(status.attempts_remaining, PHONE_MAX_CHECK_ATTEMPTS);
});

test("status: código pendente reporta tentativas e espera de reenvio", async () => {
  const status = await getPhoneStatusForUser(USER, {
    ...deps({
      loadState: async () => state({ last_sent_at: iso(NOW - 15_000) }),
      entitlement_state: null,
    }),
  });
  assert.equal(status.pending, true);
  assert.equal(status.verified, false);
  assert.equal(status.can_resend_in_seconds, 45);
  assert.equal(status.attempts_remaining, PHONE_MAX_CHECK_ATTEMPTS);
});

/* ------------------------------------------------------ 12. diagnóstico */

test("diagnóstico: sem credencial aponta o que falta e não faz chamada", async () => {
  restoreEnv();
  for (const key of ENV_KEYS) delete process.env[key];
  const fake = fakeFetch();
  const response = await handleTwilioStatus(
    new Request("https://app.test/api/public/twilio-status"),
    deps({ fetchImpl: fake.impl, config: null }),
  );
  assert.equal(response.status, 200);
  const body = await readJson(response);
  const twilio = objectField(body, "twilio");
  assert.equal(body["ok"], true);
  assert.equal(twilio["configured"], false);
  assert.ok(Array.isArray(twilio["missing"]));
  assert.equal(fake.calls.length, 0);
});

test("diagnóstico: ?live=1 valida credencial sem enviar SMS", async () => {
  const fake = fakeFetch(() => ({ status: 200, body: { sid: SERVICE_SID } }));
  process.env["TWILIO_ACCOUNT_SID"] = ACCOUNT_SID;
  process.env["TWILIO_AUTH_TOKEN"] = AUTH_TOKEN;
  process.env["TWILIO_VERIFY_SERVICE_SID"] = SERVICE_SID;
  try {
    const response = await handleTwilioStatus(
      new Request("https://app.test/api/public/twilio-status?live=1"),
      { fetchImpl: fake.impl },
    );
    const body = await readJson(response);
    const live = objectField(body, "live");
    assert.equal(live["checked"], true);
    assert.equal(live["ok"], true);
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0]?.method, "GET");
    assert.ok(fake.calls[0]?.url.endsWith(`/v2/Services/${SERVICE_SID}`));
    assert.ok(!JSON.stringify(body).includes(AUTH_TOKEN));
    assert.ok(!JSON.stringify(body).includes(SERVICE_SID));
  } finally {
    restoreEnv();
  }
});

test("diagnóstico: ?live=1 com credencial errada explica o erro sem vazar valor", async () => {
  const fake = fakeFetch(() => ({ status: 401, body: { code: 20003, message: "Auth failed" } }));
  process.env["TWILIO_ACCOUNT_SID"] = ACCOUNT_SID;
  process.env["TWILIO_AUTH_TOKEN"] = AUTH_TOKEN;
  process.env["TWILIO_VERIFY_SERVICE_SID"] = SERVICE_SID;
  try {
    const response = await handleTwilioStatus(
      new Request("https://app.test/api/public/twilio-status?live=true"),
      { fetchImpl: fake.impl },
    );
    const body = await readJson(response);
    const live = objectField(body, "live");
    assert.equal(live["checked"], true);
    assert.equal(live["ok"], false);
    assert.equal(live["error_kind"], "auth_failed");
    assert.equal(live["error_code"], 20003);
    assert.ok(!JSON.stringify(body).includes(AUTH_TOKEN));
  } finally {
    restoreEnv();
  }
});

/* -------------------------------------------------------- 13. mensagens */

test("mensagens: espera é legível para segundos, minutos e vazio", () => {
  assert.equal(formatRetryAfter(0), "alguns segundos");
  assert.equal(formatRetryAfter(null), "alguns segundos");
  assert.equal(formatRetryAfter(30), "30 s");
  assert.equal(formatRetryAfter(60), "1 minuto");
  assert.equal(formatRetryAfter(90), "2 minutos");
});

/* --------------------------------------------------------------- runner */

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

console.log(`\n${passed} casos da confirmação de celular passaram.`);

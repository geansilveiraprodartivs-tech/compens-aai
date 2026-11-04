// Testes do alerta de novo cadastro (e-mail + WhatsApp).
//
// Roda com:  node scripts/signupAlert.test.ts
//
// Nenhuma rede real é usada: o `fetch` é injetado e apenas registra as
// chamadas. Também não há banco: o "cadastro" é um objeto em memória.

import assert from "node:assert/strict";
import {
  SIGNUP_ALERT_DEFAULT_FROM,
  SIGNUP_ALERT_EMAIL_TO,
  SIGNUP_ALERT_WHATSAPP_TO,
  buildSignupAlert,
  deliverSignupAlert,
  deliveryReachedSomeone,
  deliveryUnconfigured,
  formatAlertDate,
  signupAlertChannels,
  type SignupAlertChannels,
} from "../src/lib/signupAlert.ts";
import {
  handleSignupAlertInfo,
  handleSignupAlertWebhook,
  notifySignupForUser,
  signupAlertMaxAgeMs,
  signupAlertSecret,
  type SignupAlertDeps,
  type SignupAlertUser,
} from "../src/lib/signupAlert.server.ts";

const cases: Array<[string, () => void | Promise<void>]> = [];

function test(name: string, fn: () => void | Promise<void>) {
  cases.push([name, fn]);
}

const SECRET = "segredo-do-alerta-de-cadastro";
const USER: SignupAlertUser = {
  id: "user-1",
  name: "Maria Silva",
  email: "maria@exemplo.com",
  created_at: "2026-11-03T17:32:00.000Z",
  origin: "email",
  already_notified: false,
};

const BOTH_CHANNELS: SignupAlertChannels = {
  resend: { apiKey: "re_123", from: SIGNUP_ALERT_DEFAULT_FROM, to: SIGNUP_ALERT_EMAIL_TO },
  callMeBot: { apiKey: "bot-123", phone: SIGNUP_ALERT_WHATSAPP_TO },
  whatsappCloud: null,
};

type Call = { url: string; init?: RequestInit; body: string | null };

function fakeFetch(ok = true): { calls: Call[]; impl: SignupAlertDeps["fetchImpl"] } {
  const calls: Call[] = [];
  return {
    calls,
    impl: async (url, init) => {
      calls.push({ url, init, body: typeof init?.body === "string" ? init.body : null });
      return new Response(ok ? "{}" : '{"error":"falhou"}', { status: ok ? 200 : 422 });
    },
  };
}

function deps(overrides: Partial<SignupAlertDeps> = {}): SignupAlertDeps {
  return {
    secret: SECRET,
    channels: BOTH_CHANNELS,
    fetchImpl: fakeFetch().impl,
    loadUser: async (id) => (id === USER.id ? USER : null),
    markNotified: async () => undefined,
    findUserByEmail: async (email) => (email === USER.email ? USER.id : null),
    now: () => Date.parse("2026-11-03T17:35:00.000Z"),
    maxAgeMs: 168 * 60 * 60 * 1000,
    ...overrides,
  };
}

/* --------------------------------------------------- 1. mensagens do alerta */

test("alerta: destinatários fixos são o e-mail e o WhatsApp do dono", () => {
  assert.equal(SIGNUP_ALERT_EMAIL_TO, "compens.aai@gmail.com");
  assert.equal(SIGNUP_ALERT_WHATSAPP_TO, "5551985839571");
});

test("alerta: e-mail leva nome, e-mail, origem e data", () => {
  const message = buildSignupAlert({
    name: "Maria Silva",
    email: "maria@exemplo.com",
    createdAt: "2026-11-03T17:32:00.000Z",
    origin: "email",
  });
  assert.match(message.subject, /Novo cadastro/);
  assert.match(message.subject, /Maria Silva/);
  for (const field of ["Maria Silva", "maria@exemplo.com", "E-mail e senha"]) {
    assert.ok(message.text.includes(field), `texto sem "${field}"`);
    assert.ok(message.html.includes(field), `html sem "${field}"`);
  }
});

test("alerta: WhatsApp leva as mesmas informações em texto", () => {
  const message = buildSignupAlert({
    name: "Maria Silva",
    email: "maria@exemplo.com",
    createdAt: "2026-11-03T17:32:00.000Z",
    origin: "google",
  });
  assert.match(message.whatsappText, /\*Nome:\* Maria Silva/);
  assert.match(message.whatsappText, /\*E-mail:\* maria@exemplo\.com/);
  assert.match(message.whatsappText, /Google/);
});

test("alerta: HTML escapa o que a pessoa digitou", () => {
  const message = buildSignupAlert({
    name: '<script>alert("x")</script>',
    email: "a&b@exemplo.com",
    createdAt: null,
    origin: null,
  });
  assert.equal(message.html.includes("<script>"), false);
  assert.ok(message.html.includes("&lt;script&gt;"));
  assert.ok(message.html.includes("a&amp;b@exemplo.com"));
});

test("alerta: dados ausentes não quebram a mensagem", () => {
  const message = buildSignupAlert({ name: null, email: null, createdAt: null, origin: null });
  assert.ok(message.text.includes("Não informado"));
  assert.match(message.whatsappText, /Não informado/);
});

test("alerta: data é formatada no horário de Brasília", () => {
  const formatted = formatAlertDate("2026-11-03T17:32:00.000Z");
  assert.match(formatted, /\d{2}\/\d{2}\/\d{4}/);
  assert.match(formatted, / às /);
  assert.equal(formatAlertDate(null), "Agora");
  assert.equal(formatAlertDate("não é data"), "Agora");
});

/* ------------------------------------------------------- 2. canais por env */

test("canais: sem credencial nenhuma, nada é configurado", () => {
  const channels = signupAlertChannels({});
  assert.equal(channels.resend, null);
  assert.equal(channels.callMeBot, null);
  assert.equal(channels.whatsappCloud, null);
});

test("canais: Resend usa o remetente e destinatário padrão", () => {
  const channels = signupAlertChannels({ RESEND_API_KEY: " re_abc " });
  assert.ok(channels.resend);
  assert.equal(channels.resend.apiKey, "re_abc");
  assert.equal(channels.resend.from, SIGNUP_ALERT_DEFAULT_FROM);
  assert.equal(channels.resend.to, SIGNUP_ALERT_EMAIL_TO);
});

test("canais: destino pode ser trocado por Secret, mas o padrão é o dono", () => {
  const channels = signupAlertChannels({
    RESEND_API_KEY: "re_abc",
    SIGNUP_ALERT_FROM: "CompensAI <avisos@meudominio.com>",
    SIGNUP_ALERT_EMAIL_TO: "outro@exemplo.com",
    CALLMEBOT_API_KEY: "bot-1",
    CALLMEBOT_PHONE: "5511999999999",
  });
  assert.equal(channels.resend?.from, "CompensAI <avisos@meudominio.com>");
  assert.equal(channels.resend?.to, "outro@exemplo.com");
  assert.equal(channels.callMeBot?.phone, "5511999999999");
});

test("canais: CallMeBot usa o número pessoal por padrão", () => {
  const channels = signupAlertChannels({ CALLMEBOT_API_KEY: "bot-123" });
  assert.equal(channels.callMeBot?.apiKey, "bot-123");
  assert.equal(channels.callMeBot?.phone, SIGNUP_ALERT_WHATSAPP_TO);
});

test("canais: Cloud API só existe com token e phone id", () => {
  assert.equal(signupAlertChannels({ WHATSAPP_CLOUD_TOKEN: "t" }).whatsappCloud, null);
  const channels = signupAlertChannels({
    WHATSAPP_CLOUD_TOKEN: "t",
    WHATSAPP_CLOUD_PHONE_ID: "123",
  });
  assert.equal(channels.whatsappCloud?.phoneId, "123");
  assert.equal(channels.whatsappCloud?.to, SIGNUP_ALERT_WHATSAPP_TO);
});

/* ----------------------------------------------------------- 3. entrega */

test("entrega: e-mail e WhatsApp saem juntos, cada um no seu provedor", async () => {
  const { calls, impl } = fakeFetch();
  const delivery = await deliverSignupAlert(
    { name: "Maria Silva", email: "maria@exemplo.com", createdAt: null, origin: "email" },
    BOTH_CHANNELS,
    impl,
  );

  assert.equal(delivery.email, "sent");
  assert.equal(delivery.email_provider, "resend");
  assert.equal(delivery.whatsapp, "sent");
  assert.equal(delivery.whatsapp_provider, "callmebot");
  assert.deepEqual(delivery.errors, []);
  assert.equal(calls.length, 2);

  const email = calls.find((c) => c.url === "https://api.resend.com/emails");
  assert.ok(email, "não chamou o Resend");
  assert.equal((email.init?.headers as Record<string, string>)["authorization"], "Bearer re_123");
  const emailBody = JSON.parse(email.body ?? "{}");
  assert.deepEqual(emailBody.to, ["compens.aai@gmail.com"]);
  assert.match(emailBody.subject, /Maria Silva/);
  assert.ok(emailBody.html.includes("maria@exemplo.com"));

  const zap = calls.find((c) => c.url.startsWith("https://api.callmebot.com/whatsapp.php"));
  assert.ok(zap, "não chamou o CallMeBot");
  assert.ok(zap.url.includes("phone=5551985839571"));
  assert.ok(zap.url.includes("apikey=bot-123"));
  assert.ok(decodeURIComponent(zap.url).includes("Maria Silva"));
});

test("entrega: WhatsApp Cloud API tem prioridade sobre o CallMeBot", async () => {
  const { calls, impl } = fakeFetch();
  const delivery = await deliverSignupAlert(
    { name: "Maria", email: "maria@exemplo.com", createdAt: null, origin: null },
    {
      resend: null,
      callMeBot: { apiKey: "bot-1", phone: "5511999999999" },
      whatsappCloud: { token: "cloud-token", phoneId: "999", to: "5551985839571" },
    },
    impl,
  );
  assert.equal(delivery.whatsapp_provider, "whatsapp_cloud");
  assert.equal(delivery.email, "skipped");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /graph\.facebook\.com\/v20\.0\/999\/messages/);
  const body = JSON.parse(calls[0].body ?? "{}");
  assert.equal(body.to, "5551985839571");
  assert.equal(body.type, "text");
  assert.match(body.text.body, /\*Nome:\*/);
});

test("entrega: canal sem credencial é ignorado, não é erro", async () => {
  const { calls, impl } = fakeFetch();
  const delivery = await deliverSignupAlert(
    { name: "Maria", email: "maria@exemplo.com", createdAt: null, origin: null },
    { resend: null, callMeBot: null, whatsappCloud: null },
    impl,
  );
  assert.equal(delivery.email, "skipped");
  assert.equal(delivery.whatsapp, "skipped");
  assert.equal(deliveryUnconfigured(delivery), true);
  assert.equal(deliveryReachedSomeone(delivery), false);
  assert.equal(calls.length, 0);
});

test("entrega: falha de um provedor não impede o outro", async () => {
  const calls: Call[] = [];
  const partialFail = async (url: string, init?: RequestInit) => {
    calls.push({ url, init, body: null });
    const isEmail = url.includes("resend.com");
    return new Response(isEmail ? '{"message":"domínio inválido"}' : "{}", {
      status: isEmail ? 422 : 200,
    });
  };
  const delivery = await deliverSignupAlert(
    { name: "Maria", email: "maria@exemplo.com", createdAt: null, origin: null },
    BOTH_CHANNELS,
    partialFail,
  );
  assert.equal(delivery.email, "failed");
  assert.equal(delivery.whatsapp, "sent");
  assert.equal(delivery.errors.length, 1);
  assert.match(delivery.errors[0], /resend/);
  assert.equal(deliveryReachedSomeone(delivery), true);
});

test("entrega: nunca lança, mesmo com fetch explodindo", async () => {
  const boom = async () => {
    throw new Error("sem rede");
  };
  const delivery = await deliverSignupAlert(
    { name: "Maria", email: "maria@exemplo.com", createdAt: null, origin: null },
    BOTH_CHANNELS,
    boom,
  );
  assert.equal(delivery.email, "failed");
  assert.equal(delivery.whatsapp, "failed");
  assert.equal(deliveryReachedSomeone(delivery), false);
});

/* ------------------------------------------------ 4. alerta por cadastro */

test("cadastro: envia e marca como avisado", async () => {
  const { calls, impl } = fakeFetch();
  const marked: string[] = [];
  const result = await notifySignupForUser(
    USER.id,
    deps({ fetchImpl: impl, markNotified: async (id) => void marked.push(id) }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.reason, "sent");
  assert.equal(calls.length, 2);
  assert.deepEqual(marked, [USER.id]);
});

test("cadastro: já avisado não recebe segundo alerta", async () => {
  const { calls, impl } = fakeFetch();
  const result = await notifySignupForUser(
    USER.id,
    deps({
      fetchImpl: impl,
      loadUser: async () => ({ ...USER, already_notified: true }),
    }),
  );
  assert.equal(result.reason, "already_notified");
  assert.equal(calls.length, 0);
});

test("cadastro: conta inexistente não dispara nada", async () => {
  const { calls, impl } = fakeFetch();
  const result = await notifySignupForUser(
    "sumiu",
    deps({ fetchImpl: impl, loadUser: async () => null }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "user_not_found");
  assert.equal(calls.length, 0);
});

test("cadastro: conta antiga não vira alerta de novo cadastro", async () => {
  const { calls, impl } = fakeFetch();
  const result = await notifySignupForUser(
    USER.id,
    deps({
      fetchImpl: impl,
      loadUser: async () => ({ ...USER, created_at: "2026-10-01T10:00:00.000Z" }),
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.reason, "stale_signup");
  assert.equal(calls.length, 0);
});

test("cadastro: sem data de criação o alerta sai (não dá para saber a idade)", async () => {
  const { calls, impl } = fakeFetch();
  const result = await notifySignupForUser(
    USER.id,
    deps({ fetchImpl: impl, loadUser: async () => ({ ...USER, created_at: null }) }),
  );
  assert.equal(result.reason, "sent");
  assert.equal(calls.length, 2);
});

test("cadastro: janela de idade é configurável e tem padrão de 7 dias", () => {
  const original = process.env["SIGNUP_ALERT_MAX_AGE_HOURS"];
  try {
    delete process.env["SIGNUP_ALERT_MAX_AGE_HOURS"];
    assert.equal(signupAlertMaxAgeMs(), 168 * 60 * 60 * 1000);
    process.env["SIGNUP_ALERT_MAX_AGE_HOURS"] = "1.5";
    assert.equal(signupAlertMaxAgeMs(), 1.5 * 60 * 60 * 1000);
    process.env["SIGNUP_ALERT_MAX_AGE_HOURS"] = "-3";
    assert.equal(signupAlertMaxAgeMs(), 168 * 60 * 60 * 1000);
  } finally {
    if (original === undefined) delete process.env["SIGNUP_ALERT_MAX_AGE_HOURS"];
    else process.env["SIGNUP_ALERT_MAX_AGE_HOURS"] = original;
  }
});

test("cadastro: falha nos dois canais não marca como avisado (pode tentar depois)", async () => {
  const { impl } = fakeFetch(false);
  const marked: string[] = [];
  const result = await notifySignupForUser(
    USER.id,
    deps({ fetchImpl: impl, markNotified: async (id) => void marked.push(id) }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "delivery_failed");
  assert.deepEqual(marked, []);
});

test("cadastro: sem canal configurado avisa no resultado e não marca", async () => {
  const { calls, impl } = fakeFetch();
  const marked: string[] = [];
  const result = await notifySignupForUser(
    USER.id,
    deps({
      fetchImpl: impl,
      channels: { resend: null, callMeBot: null, whatsappCloud: null },
      markNotified: async (id) => void marked.push(id),
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no_channel");
  assert.equal(calls.length, 0);
  assert.deepEqual(marked, []);
});

test("cadastro: erro ao marcar não desfaz o alerta já enviado", async () => {
  const { calls, impl } = fakeFetch();
  const result = await notifySignupForUser(
    USER.id,
    deps({
      fetchImpl: impl,
      markNotified: async () => {
        throw new Error("banco fora");
      },
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.reason, "sent");
  assert.equal(calls.length, 2);
});

/* ------------------------------------------------------------ 5. webhook */

function post(body: unknown, headers: Record<string, string>): Request {
  return new Request("https://compens-aai.lovable.app/api/public/signup-alert", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const ENV_KEYS = [
  "RESEND_API_KEY",
  "CALLMEBOT_API_KEY",
  "SIGNUP_ALERT_SECRET",
  "WHATSAPP_CLOUD_TOKEN",
  "WHATSAPP_CLOUD_PHONE_ID",
] as const;

function withEnv(
  values: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  fn: () => void | Promise<void>,
): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  return (async () => {
    try {
      await fn();
    } finally {
      for (const key of ENV_KEYS) {
        const previous = saved.get(key);
        if (previous === undefined) delete process.env[key];
        else process.env[key] = previous;
      }
    }
  })();
}

test("webhook: GET de verificação responde ok e o status dos canais", async () => {
  await withEnv({}, async () => {
    const json = await handleSignupAlertInfo().json();
    assert.equal(json.ok, true);
    assert.equal(json.endpoint, "signup-alert");
    assert.deepEqual(json.channels, { email: false, whatsapp: false });
    assert.equal(json.webhook_protected, false);
    assert.equal(json.max_age_hours, 168);
  });

  await withEnv(
    {
      RESEND_API_KEY: "re_chave_secreta",
      CALLMEBOT_API_KEY: "bot_chave_secreta",
      SIGNUP_ALERT_SECRET: "segredo-do-webhook",
    },
    async () => {
      const json = await handleSignupAlertInfo().json();
      assert.deepEqual(json.channels, { email: "resend", whatsapp: "callmebot" });
      assert.equal(json.webhook_protected, true);
      // O diagnóstico nunca expõe as credenciais.
      const raw = JSON.stringify(json);
      assert.equal(raw.includes("re_chave_secreta"), false);
      assert.equal(raw.includes("bot_chave_secreta"), false);
      assert.equal(raw.includes("segredo-do-webhook"), false);
    },
  );
});

test("webhook: segredo é obrigatório (fail closed)", async () => {
  const { calls, impl } = fakeFetch();
  const response = await handleSignupAlertWebhook(
    post({ id: USER.id }, { "x-signup-alert-secret": SECRET }),
    deps({ secret: null, fetchImpl: impl }),
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: "webhook_not_configured" });
  assert.equal(calls.length, 0);
});

test("webhook: segredo errado é recusado", async () => {
  const { calls, impl } = fakeFetch();
  const response = await handleSignupAlertWebhook(
    post({ id: USER.id }, { "x-signup-alert-secret": "outro-segredo" }),
    deps({ fetchImpl: impl }),
  );
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("webhook: JSON inválido responde 400", async () => {
  const response = await handleSignupAlertWebhook(
    post("nao é json", { "x-signup-alert-secret": SECRET }),
    deps(),
  );
  assert.equal(response.status, 400);
});

test("webhook: aceita o formato do Supabase Database Webhook", async () => {
  const { calls, impl } = fakeFetch();
  const response = await handleSignupAlertWebhook(
    post(
      {
        type: "INSERT",
        table: "users",
        schema: "auth",
        record: {
          id: USER.id,
          email: "maria@exemplo.com",
          created_at: "2026-11-03T17:32:00.000Z",
          raw_user_meta_data: { full_name: "Nome que veio do corpo" },
        },
      },
      { authorization: `Bearer ${SECRET}` },
    ),
    deps({ fetchImpl: impl }),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.reason, "sent");
  assert.equal(calls.length, 2);
  // Usa o nome do BANCO, não o que veio no corpo do webhook.
  const email = calls.find((c) => c.url.includes("resend.com"));
  assert.ok(email?.body?.includes("Maria Silva"));
  assert.equal(email?.body?.includes("Nome que veio do corpo"), false);
});

test("webhook: sem id, acha a conta pelo e-mail", async () => {
  const { impl } = fakeFetch();
  const response = await handleSignupAlertWebhook(
    post({ email: USER.email }, { "x-signup-alert-secret": SECRET }),
    deps({ fetchImpl: impl }),
  );
  assert.equal(response.status, 200);
});

test("webhook: conta desconhecida responde 404 sem enviar", async () => {
  const { calls, impl } = fakeFetch();
  const response = await handleSignupAlertWebhook(
    post({ email: "ninguem@exemplo.com" }, { "x-signup-alert-secret": SECRET }),
    deps({ fetchImpl: impl }),
  );
  assert.equal(response.status, 404);
  assert.equal(calls.length, 0);
});

test("webhook: cadastro já avisado responde 200 sem repetir", async () => {
  const { calls, impl } = fakeFetch();
  const response = await handleSignupAlertWebhook(
    post({ id: USER.id }, { "x-signup-alert-secret": SECRET }),
    deps({
      fetchImpl: impl,
      loadUser: async () => ({ ...USER, already_notified: true }),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reason, "already_notified");
  assert.equal(calls.length, 0);
});

test("webhook: segredo do ambiente só vale com 8+ caracteres", () => {
  const original = process.env["SIGNUP_ALERT_SECRET"];
  try {
    process.env["SIGNUP_ALERT_SECRET"] = "curto";
    assert.equal(signupAlertSecret(), null);
    process.env["SIGNUP_ALERT_SECRET"] = "  segredo-bom  ";
    assert.equal(signupAlertSecret(), "segredo-bom");
  } finally {
    if (original === undefined) delete process.env["SIGNUP_ALERT_SECRET"];
    else process.env["SIGNUP_ALERT_SECRET"] = original;
  }
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

console.log(`\n${passed} casos do alerta de novo cadastro passaram.`);

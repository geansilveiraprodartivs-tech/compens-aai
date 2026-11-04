/**
 * Camada de servidor do alerta de novo cadastro.
 *
 * O módulo puro (`signupAlert.ts`) monta as mensagens e entrega nos dois canais.
 * Aqui ficam as partes que dependem do ambiente:
 *
 *  - leitura das credenciais nas Secrets (`RESEND_API_KEY`, `CALLMEBOT_*`,
 *    `WHATSAPP_CLOUD_*`) — nenhuma delas é obrigatória;
 *  - busca do cadastro no `auth.users` (nome, e-mail, data, origem) com a
 *    service role, sempre pelo `id` — o nome/e-mail NUNCA vêm do navegador;
 *  - idempotência por `signup_notified_at` no mesmo objeto `compensai` do
 *    `app_metadata` (sem DDL): o alerta sai uma única vez por conta;
 *  - rota pública `POST /api/public/signup-alert` para quem quiser ligar um
 *    Supabase Database Webhook (o segredo `SIGNUP_ALERT_SECRET` é obrigatório).
 *
 * A entrega é "melhor esforço": falha de e-mail/WhatsApp nunca quebra o app e
 * nunca impede o cadastro.
 */
import {
  deliverSignupAlert,
  deliveryReachedSomeone,
  signupAlertChannels,
  type SignupAlertChannels,
  type SignupAlertDelivery,
} from "./signupAlert.ts";

const MAX_BODY_BYTES = 64 * 1024;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Comparação em tempo constante (evita vazar o segredo por tempo de resposta). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Cadastro a ser anunciado, lido do banco (fonte da verdade). */
export type SignupAlertUser = {
  id: string;
  name: string | null;
  email: string | null;
  created_at: string | null;
  /** `google`, `email`, ... */
  origin: string | null;
  /** Já houve alerta para esta conta? */
  already_notified: boolean;
};

export type NotifySignupReason =
  | "sent"
  | "already_notified"
  | "user_not_found"
  | "stale_signup"
  | "no_channel"
  | "delivery_failed";

export type NotifySignupResult = {
  ok: boolean;
  reason: NotifySignupReason;
  delivery: SignupAlertDelivery | null;
};

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export type SignupAlertDeps = {
  /** Segredo do webhook (`SIGNUP_ALERT_SECRET`); `null` desliga a rota. */
  secret: string | null;
  /** Canais configurados (sem credencial = `null` = canal ignorado). */
  channels: SignupAlertChannels;
  fetchImpl: FetchImpl;
  /** Cadastro pelo id (service role). */
  loadUser: (userId: string) => Promise<SignupAlertUser | null>;
  /** Marca `signup_notified_at` (idempotência). */
  markNotified: (userId: string) => Promise<void>;
  /** Acha o id a partir do e-mail (usado só pelo webhook). */
  findUserByEmail: (email: string) => Promise<string | null>;
  /** Relógio do servidor (injetável nos testes). */
  now: () => number;
  /**
   * Idade máxima de um cadastro para ainda valer alerta. Evita que, ao ligar o
   * recurso, contas antigas disparem uma enxurrada de "novo cadastro".
   */
  maxAgeMs: number;
};

/** Janela padrão: 7 dias (`SIGNUP_ALERT_MAX_AGE_HOURS` muda isso). */
export const SIGNUP_ALERT_MAX_AGE_DEFAULT_HOURS = 168;

export function signupAlertMaxAgeMs(): number {
  const raw = process.env["SIGNUP_ALERT_MAX_AGE_HOURS"];
  const hours = typeof raw === "string" ? Number.parseFloat(raw) : Number.NaN;
  const valid = Number.isFinite(hours) && hours > 0 ? hours : SIGNUP_ALERT_MAX_AGE_DEFAULT_HOURS;
  return Math.round(valid * 60 * 60 * 1000);
}

/**
 * Segredo da rota de webhook. Sem ele a rota falha fechada: um endpoint que
 * dispara e-mail e WhatsApp para o dono não pode ficar aberto.
 */
export function signupAlertSecret(): string | null {
  const raw = process.env["SIGNUP_ALERT_SECRET"];
  const value = typeof raw === "string" ? raw.trim() : "";
  return value.length >= 8 ? value : null;
}

function envRecord(): Record<string, string | undefined> {
  return process.env as unknown as Record<string, string | undefined>;
}

let cachedDefaults: SignupAlertDeps | null = null;

async function resolveDeps(override?: Partial<SignupAlertDeps>): Promise<SignupAlertDeps> {
  // Testes passam todas as dependências: nada de importar o Supabase aqui.
  if (override?.loadUser && override.markNotified && override.findUserByEmail) {
    return {
      secret: override.secret ?? null,
      channels: override.channels ?? signupAlertChannels(envRecord()),
      fetchImpl: override.fetchImpl ?? (fetch as unknown as FetchImpl),
      loadUser: override.loadUser,
      markNotified: override.markNotified,
      findUserByEmail: override.findUserByEmail,
      now: override.now ?? (() => Date.now()),
      maxAgeMs: override.maxAgeMs ?? signupAlertMaxAgeMs(),
    };
  }

  if (!cachedDefaults) {
    const server = await import("@/lib/entitlement.server");
    cachedDefaults = {
      secret: signupAlertSecret(),
      channels: signupAlertChannels(envRecord()),
      fetchImpl: fetch as unknown as FetchImpl,
      loadUser: (userId) => server.getSignupAlertTarget(userId),
      markNotified: (userId) => server.markSignupNotified(userId),
      findUserByEmail: (email) => server.findUserByEmail(email),
      now: () => Date.now(),
      maxAgeMs: signupAlertMaxAgeMs(),
    };
  }
  return { ...cachedDefaults, ...override };
}

/**
 * Emite o alerta de um cadastro. Idempotente: se `signup_notified_at` já
 * existe, não envia nada. Só grava a marca quando pelo menos um canal entregou
 * de verdade (assim uma falha de configuração pode ser corrigida e o alerta
 * ainda sai na próxima abertura do app).
 */
export async function notifySignupForUser(
  userId: string,
  override?: Partial<SignupAlertDeps>,
): Promise<NotifySignupResult> {
  const deps = await resolveDeps(override);

  const user = await deps.loadUser(userId);
  if (!user) return { ok: false, reason: "user_not_found", delivery: null };
  if (user.already_notified) return { ok: true, reason: "already_notified", delivery: null };

  // Cadastro antigo (anterior a esta janela) não é "novo cadastro": silencia
  // para não avisar de contas que já existiam antes do recurso ser ligado.
  const createdAt = user.created_at ? Date.parse(user.created_at) : Number.NaN;
  if (Number.isFinite(createdAt) && deps.now() - createdAt > deps.maxAgeMs) {
    return { ok: true, reason: "stale_signup", delivery: null };
  }

  const delivery = await deliverSignupAlert(
    {
      name: user.name,
      email: user.email,
      createdAt: user.created_at,
      origin: user.origin,
    },
    deps.channels,
    deps.fetchImpl,
  );

  if (delivery.email === "skipped" && delivery.whatsapp === "skipped") {
    console.warn(
      "[CompensAI] alerta de novo cadastro sem canal configurado: defina RESEND_API_KEY e/ou CALLMEBOT_API_KEY (ou WHATSAPP_CLOUD_*).",
    );
    return { ok: false, reason: "no_channel", delivery };
  }

  if (!deliveryReachedSomeone(delivery)) {
    console.error(
      "[CompensAI] alerta de novo cadastro não foi entregue:",
      delivery.errors.join(" | ") || "sem detalhe",
    );
    return { ok: false, reason: "delivery_failed", delivery };
  }

  try {
    await deps.markNotified(userId);
  } catch (error) {
    // O alerta já saiu; a marca é só para não repetir. Falha aqui não é erro.
    console.error(
      "[CompensAI] alerta enviado, mas não foi possível marcar signup_notified_at:",
      error,
    );
  }

  return { ok: true, reason: "sent", delivery };
}

/* ---------------------------------------------------------------- webhook */

/**
 * GET de verificação. Além de dizer que a rota existe, informa **se** cada
 * canal está configurado (apenas o nome do provedor — nunca a chave, telefone
 * ou e-mail). Serve para o dono conferir os Secrets sem precisar de um
 * cadastro de teste.
 */
export function handleSignupAlertInfo(): Response {
  const channels = signupAlertChannels(envRecord());
  return json({
    ok: true,
    endpoint: "signup-alert",
    channels: {
      email: channels.resend ? "resend" : false,
      whatsapp: channels.whatsappCloud
        ? "whatsapp_cloud"
        : channels.callMeBot
          ? "callmebot"
          : false,
    },
    webhook_protected: signupAlertSecret() !== null,
    max_age_hours: Math.round(signupAlertMaxAgeMs() / (60 * 60 * 1000)),
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Aceita tanto o corpo do Supabase Database Webhook
 * (`{ type, table, schema, record }`) quanto um JSON simples
 * (`{ id }` ou `{ user_id }` ou `{ email }`).
 */
function pickRecord(body: unknown): Record<string, unknown> | null {
  const root = asRecord(body);
  if (!root) return null;
  const record = asRecord(root["record"]);
  if (record) return record;
  const row = asRecord(root["row"]);
  if (row) return row;
  return root;
}

function pickId(record: Record<string, unknown>): string | null {
  return text(record["id"]) ?? text(record["user_id"]) ?? text(record["userId"]);
}

function pickEmail(record: Record<string, unknown>): string | null {
  return text(record["email"]);
}

/**
 * POST do webhook. Fail closed: sem `SIGNUP_ALERT_SECRET` a rota responde 401.
 * O segredo pode vir em `X-Signup-Alert-Secret` ou `Authorization: Bearer ...`.
 */
export async function handleSignupAlertWebhook(
  request: Request,
  override?: Partial<SignupAlertDeps>,
): Promise<Response> {
  const deps = await resolveDeps(override);

  const secret = deps.secret;
  if (!secret) {
    console.error(
      "[CompensAI] SIGNUP_ALERT_SECRET ausente: webhook do alerta de cadastro recusado (fail closed).",
    );
    return json({ ok: false, error: "webhook_not_configured" }, 401);
  }

  const header = request.headers.get("x-signup-alert-secret");
  const bearer =
    request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim() ?? "";
  const provided = (header ?? "").trim() || bearer;
  if (!provided || !safeEqual(provided, secret)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ ok: false, error: "body_too_large" }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const record = pickRecord(body);
  if (!record) return json({ ok: false, error: "missing_record" }, 400);

  const id = pickId(record);
  const email = pickEmail(record);
  let userId = id;
  if (!userId && email) {
    userId = await deps.findUserByEmail(email);
  }
  if (!userId) return json({ ok: false, error: "user_not_found" }, 404);

  const result = await notifySignupForUser(userId, deps);

  if (result.ok) {
    return json({ ok: true, reason: result.reason, delivery: result.delivery }, 200);
  }
  if (result.reason === "user_not_found") {
    return json({ ok: false, error: "user_not_found" }, 404);
  }
  // Sem canal configurado não adianta o Supabase reenviar: registra e encerra.
  if (result.reason === "no_channel") {
    return json({ ok: true, reason: result.reason, delivery: result.delivery }, 200);
  }
  return json({ ok: false, reason: result.reason, delivery: result.delivery }, 502);
}

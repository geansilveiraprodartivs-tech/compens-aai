/**
 * Camada de servidor da confirmação de celular por SMS (Twilio Verify V2).
 *
 * - Usa SOMENTE o Twilio Verify (`/v2/Services/{sid}/Verifications` e
 *   `/VerificationCheck`). Não há Programmable Messaging aqui: quem gera e
 *   valida o código é a Twilio, então nenhum código é inventado, salvo ou
 *   comparado do nosso lado.
 * - Credenciais vêm exclusivamente das Secrets do servidor
 *   (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` ou `TWILIO_API_KEY` +
 *   `TWILIO_API_KEY_SECRET`, `TWILIO_VERIFY_SERVICE_SID`). Nada é enviado ao
 *   navegador, impresso em log ou gravado no repositório.
 * - O estado por conta fica em `auth.users.app_metadata.compensai_phone`
 *   (chave separada do billing, gravada só com a service role, sem DDL).
 * - Rate limit, tentativas e expiração são controlados aqui, antes e depois da
 *   chamada à Twilio; os erros do provedor são traduzidos para mensagens
 *   seguras, sem repetir telefone nem credencial.
 *
 * Nunca importe este arquivo do topo de um `*.functions.ts` ou de uma rota:
 * use `await import("@/lib/phoneVerification.server")` dentro do handler.
 */
import {
  PHONE_CODE_MAX_LENGTH,
  PHONE_CODE_MIN_LENGTH,
  PHONE_LOCK_SECONDS,
  PHONE_MAX_CHECK_ATTEMPTS,
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
  type CheckCodeReason,
  type CheckCodeResult,
  type PhoneProviderError,
  type PhoneProviderErrorKind,
  type PhoneStatus,
  type PhoneVerificationState,
  type SendCodeReason,
  type SendCodeResult,
} from "./phoneVerification.ts";

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

const MAX_PROVIDER_MESSAGE = 240;
const TIMEOUT_MS = 10_000;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function envRecord(): Record<string, string | undefined> {
  return process.env as unknown as Record<string, string | undefined>;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/* --------------------------------------------------------------- credenciais */

export type TwilioConfig = {
  accountSid: string;
  verifyServiceSid: string;
  /** Usuário do Basic Auth: API Key (recomendado) ou Account SID. */
  username: string;
  /** Senha do Basic Auth: API Key Secret ou Auth Token. */
  password: string;
  authMode: "api_key" | "auth_token";
};

const ACCOUNT_SID_RE = /^AC[0-9a-fA-F]{32}$/;
const SERVICE_SID_RE = /^VA[0-9a-fA-F]{32}$/;
const API_KEY_RE = /^SK[0-9a-fA-F]{32}$/;

export type TwilioConfigRead = {
  config: TwilioConfig | null;
  /** Nomes das variáveis ausentes (nunca valores). */
  missing: string[];
  /** Nomes das variáveis com formato inválido (nunca valores). */
  invalid: string[];
};

/**
 * Lê as credenciais do ambiente. A Auth Token e o par API Key/Secret são
 * alternativas: se o par existir, ele tem prioridade. Nenhum valor sai daqui.
 */
export function readTwilioConfig(env: Record<string, string | undefined>): TwilioConfigRead {
  const accountSid = str(env["TWILIO_ACCOUNT_SID"]);
  const authToken = str(env["TWILIO_AUTH_TOKEN"]);
  const apiKey = str(env["TWILIO_API_KEY"]);
  const apiKeySecret = str(env["TWILIO_API_KEY_SECRET"]);
  const verifyServiceSid =
    str(env["TWILIO_VERIFY_SERVICE_SID"]) ||
    str(env["TWILIO_VERIFY_SERVICE"]) ||
    str(env["TWILIO_SERVICE_SID"]);

  const missing: string[] = [];
  const invalid: string[] = [];

  if (!accountSid) missing.push("TWILIO_ACCOUNT_SID");
  else if (!ACCOUNT_SID_RE.test(accountSid)) invalid.push("TWILIO_ACCOUNT_SID");

  const hasApiKeyPair = apiKey !== "" && apiKeySecret !== "";
  const authMode: TwilioConfig["authMode"] = hasApiKeyPair ? "api_key" : "auth_token";

  if (!hasApiKeyPair && !authToken) {
    missing.push("TWILIO_AUTH_TOKEN (ou TWILIO_API_KEY + TWILIO_API_KEY_SECRET)");
  }
  if (apiKey !== "" || apiKeySecret !== "") {
    if (!hasApiKeyPair) {
      missing.push(apiKey === "" ? "TWILIO_API_KEY" : "TWILIO_API_KEY_SECRET");
    } else if (!API_KEY_RE.test(apiKey)) {
      invalid.push("TWILIO_API_KEY");
    }
  } else if (authToken !== "" && authToken.length < 8) {
    invalid.push("TWILIO_AUTH_TOKEN");
  }

  if (!verifyServiceSid) missing.push("TWILIO_VERIFY_SERVICE_SID");
  else if (!SERVICE_SID_RE.test(verifyServiceSid)) invalid.push("TWILIO_VERIFY_SERVICE_SID");

  if (missing.length > 0 || invalid.length > 0) return { config: null, missing, invalid };

  return {
    config: {
      accountSid,
      verifyServiceSid,
      username: hasApiKeyPair ? apiKey : accountSid,
      password: hasApiKeyPair ? apiKeySecret : authToken,
      authMode,
    },
    missing,
    invalid,
  };
}

/** Diagnóstico público: **se** está configurado, nunca o valor. */
export function twilioConfigStatus(
  env: Record<string, string | undefined>,
): Record<string, unknown> {
  const { config, missing, invalid } = readTwilioConfig(env);
  return {
    configured: config !== null,
    auth_mode: config?.authMode ?? null,
    missing,
    invalid,
    account_sid: str(env["TWILIO_ACCOUNT_SID"]) !== "",
    verify_service_sid:
      str(env["TWILIO_VERIFY_SERVICE_SID"]) !== "" ||
      str(env["TWILIO_VERIFY_SERVICE"]) !== "" ||
      str(env["TWILIO_SERVICE_SID"]) !== "",
    gate_required: phoneVerificationRequired(env),
  };
}

/* ------------------------------------------------------------------ provedor */

type TwilioCallResult =
  | { ok: true; status: number; body: Record<string, unknown> | null }
  | { ok: false; status: number; error: PhoneProviderError };

function basicAuth(config: TwilioConfig): string {
  // btoa existe no runtime do Worker e no Node; as credenciais são ASCII.
  return btoa(`${config.username}:${config.password}`);
}

function timeoutSignal(): AbortSignal | null {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") return null;
  return AbortSignal.timeout(TIMEOUT_MS);
}

/** Remove telefone (sequências longas de dígitos) e limita o tamanho. */
function sanitizeProviderMessage(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  return raw
    .replace(/\s+/g, " ")
    .replace(/\+?\d{8,}/g, "[número]")
    .slice(0, MAX_PROVIDER_MESSAGE);
}

/** Traduz o erro da Twilio em algo que possamos tratar e mostrar com segurança. */
export function mapTwilioError(body: unknown, httpStatus: number): PhoneProviderError {
  const record =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  const rawCode = record?.["code"];
  const code = typeof rawCode === "number" && Number.isFinite(rawCode) ? rawCode : null;
  const message = sanitizeProviderMessage(record?.["message"]);

  let kind: PhoneProviderErrorKind = "unknown";

  switch (code) {
    case 20003:
      kind = "auth_failed";
      break;
    case 20404:
      kind = "service_not_found";
      break;
    case 20429:
      kind = "rate_limited";
      break;
    case 21211:
    case 21604:
    case 21606:
    case 60200:
      kind = "invalid_phone";
      break;
    case 21614:
      kind = "not_mobile";
      break;
    case 21608:
      kind = "number_not_verified";
      break;
    case 21408:
      kind = "region_not_enabled";
      break;
    case 21610:
      kind = "blocked";
      break;
    case 60202:
      kind = "too_many_attempts";
      break;
    case 60203:
      kind = "rate_limited";
      break;
    default:
      break;
  }

  if (kind === "unknown") {
    if (httpStatus === 401 || httpStatus === 403) kind = "auth_failed";
    else if (httpStatus === 404) kind = "service_not_found";
    else if (httpStatus === 429) kind = "rate_limited";
  }

  return { kind, code, message: message || `HTTP ${httpStatus}` };
}

async function callTwilio(input: {
  config: TwilioConfig;
  url: string;
  method: "GET" | "POST";
  form?: Record<string, string>;
  fetchImpl: FetchImpl;
}): Promise<TwilioCallResult> {
  const headers: Record<string, string> = {
    authorization: `Basic ${basicAuth(input.config)}`,
  };
  const init: RequestInit = { method: input.method, headers };
  if (input.method === "POST") {
    headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(input.form ?? {}).toString();
  }
  const signal = timeoutSignal();
  if (signal) init.signal = signal;

  let response: Response;
  try {
    response = await input.fetchImpl(input.url, init);
  } catch {
    // Nunca repetimos a mensagem crua: ela pode conter a URL do serviço.
    return {
      ok: false,
      status: 0,
      error: { kind: "network", code: null, message: "falha de rede ao contatar a Twilio" },
    };
  }

  const raw = await response.text().catch(() => "");
  let body: Record<string, unknown> | null = null;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      body = null;
    }
  }

  if (response.ok) return { ok: true, status: response.status, body };
  return { ok: false, status: response.status, error: mapTwilioError(body, response.status) };
}

function serviceUrl(config: TwilioConfig, suffix = ""): string {
  return `https://verify.twilio.com/v2/Services/${encodeURIComponent(config.verifyServiceSid)}${suffix}`;
}

/** GET no serviço Verify: valida credencial + Service SID sem enviar SMS. */
export async function checkVerifyService(
  config: TwilioConfig,
  fetchImpl: FetchImpl,
): Promise<TwilioCallResult> {
  return callTwilio({ config, url: serviceUrl(config), method: "GET", fetchImpl });
}

async function requestVerification(
  config: TwilioConfig,
  phone: string,
  fetchImpl: FetchImpl,
): Promise<TwilioCallResult> {
  return callTwilio({
    config,
    url: serviceUrl(config, "/Verifications"),
    method: "POST",
    form: { To: phone, Channel: "sms", Locale: "pt-BR" },
    fetchImpl,
  });
}

async function checkVerificationCode(
  config: TwilioConfig,
  phone: string,
  code: string,
  fetchImpl: FetchImpl,
): Promise<TwilioCallResult> {
  return callTwilio({
    config,
    url: serviceUrl(config, "/VerificationCheck"),
    method: "POST",
    form: { To: phone, Code: code },
    fetchImpl,
  });
}

/* ------------------------------------------------------------------ mensagens */

const NOT_CONFIGURED_MESSAGE =
  "O envio de SMS ainda não está configurado no servidor. Fale com o suporte para liberar a confirmação de celular.";

function messageForProviderError(error: PhoneProviderError, phase: "send" | "check"): string {
  switch (error.kind) {
    case "auth_failed":
      return "O serviço de SMS recusou as credenciais configuradas. Avise o suporte.";
    case "service_not_found":
      return phase === "send"
        ? "O serviço de verificação por SMS não foi encontrado. Avise o suporte."
        : "Este código não existe mais. Peça um novo código.";
    case "number_not_verified":
      return "Este celular ainda não está autorizado na conta de teste da Twilio. Peça ao suporte para liberar o número.";
    case "region_not_enabled":
      return "O envio de SMS para esta região não está habilitado na Twilio.";
    case "blocked":
      return "Não foi possível enviar SMS para este número. Tente outro celular.";
    case "too_many_attempts":
      return `Muitas tentativas de código. Aguarde ${formatRetryAfter(
        PHONE_LOCK_SECONDS,
      )} e peça um novo código.`;
    case "rate_limited":
      return "Muitos pedidos de código em pouco tempo. Aguarde alguns minutos e tente novamente.";
    case "network":
      return "Não foi possível falar com o serviço de SMS agora. Tente novamente em instantes.";
    case "invalid_phone":
      return "O serviço de SMS recusou o número. Confira o DDD e o celular informado.";
    case "not_mobile":
      return "Esse número não recebe SMS (parece ser um telefone fixo). Informe um celular.";
    case "unknown":
      return "Não foi possível concluir a verificação agora. Tente novamente.";
  }
}

function reasonForProviderError(
  error: PhoneProviderError,
): "invalid_phone" | "not_configured" | "provider_error" {
  if (error.kind === "invalid_phone" || error.kind === "not_mobile") return "invalid_phone";
  if (error.kind === "auth_failed" || error.kind === "service_not_found") return "not_configured";
  return "provider_error";
}

function sendFailure(
  reason: SendCodeResult["reason"],
  message: string,
  options: { retryAfter?: number | null; maskedPhone?: string | null } = {},
): SendCodeResult {
  return {
    ok: false,
    reason,
    message,
    retry_after_seconds: options.retryAfter ?? null,
    masked_phone: options.maskedPhone ?? null,
    provider_error: null,
  };
}

function checkFailure(
  reason: CheckCodeResult["reason"],
  message: string,
  options: { attemptsRemaining?: number; retryAfter?: number | null } = {},
): CheckCodeResult {
  return {
    ok: false,
    verified: false,
    reason,
    message,
    attempts_remaining: options.attemptsRemaining ?? PHONE_MAX_CHECK_ATTEMPTS,
    retry_after_seconds: options.retryAfter ?? null,
    provider_error: null,
  };
}

/* ------------------------------------------------------- dependências/estado */

export type PhoneVerificationDeps = {
  config: TwilioConfig | null;
  missing: string[];
  fetchImpl: FetchImpl;
  loadState: (userId: string) => Promise<PhoneVerificationState | null>;
  saveState: (userId: string, state: PhoneVerificationState | null) => Promise<void>;
  /** Conta diferente que já confirmou este celular (`null` se ninguém confirmou). */
  findVerifiedPhoneOwner: (e164: string, exceptUserId: string) => Promise<string | null>;
  now: () => number;
};

type AdminUser = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function fetchUser(userId: string): Promise<AdminUser> {
  const db = await admin();
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    throw new Error(`Conta não encontrada: ${error?.message ?? userId}`);
  }
  return data.user as AdminUser;
}

/** Serializa gravações do mesmo usuário nesta instância (padrão do projeto). */
const locks = new Map<string, Promise<void>>();

async function withUserLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => gate).catch(() => gate);
  locks.set(key, chained);
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === chained) locks.delete(key);
  }
}

async function defaultLoadState(userId: string): Promise<PhoneVerificationState | null> {
  const user = await fetchUser(userId);
  return readPhoneState(user.app_metadata);
}

async function defaultSaveState(
  userId: string,
  state: PhoneVerificationState | null,
): Promise<void> {
  await withUserLock(userId, async () => {
    const user = await fetchUser(userId);
    const appMetadata: Record<string, unknown> = { ...(user.app_metadata ?? {}) };
    if (state) {
      appMetadata[PHONE_META_KEY] = { ...state, updated_at: new Date().toISOString() };
    } else {
      delete appMetadata[PHONE_META_KEY];
    }
    const db = await admin();
    const { error } = await db.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
    if (error) throw new Error(`Falha ao gravar a confirmação de celular: ${error.message}`);
  });
}

async function defaultFindVerifiedPhoneOwner(
  e164: string,
  exceptUserId: string,
): Promise<string | null> {
  const db = await admin();
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Falha ao verificar o celular: ${error.message}`);
    const users = (data?.users ?? []) as AdminUser[];
    for (const user of users) {
      if (user.id === exceptUserId) continue;
      const state = readPhoneState(user.app_metadata);
      if (state?.verified_at && state.phone === e164) return user.id;
    }
    if (users.length < 200) return null;
  }
  return null;
}

async function resolveDeps(
  override?: Partial<PhoneVerificationDeps>,
): Promise<PhoneVerificationDeps> {
  const { config, missing } = readTwilioConfig(envRecord());
  return {
    config: override?.config !== undefined ? override.config : config,
    missing: override?.missing ?? missing,
    fetchImpl: override?.fetchImpl ?? (fetch as unknown as FetchImpl),
    loadState: override?.loadState ?? defaultLoadState,
    saveState: override?.saveState ?? defaultSaveState,
    findVerifiedPhoneOwner: override?.findVerifiedPhoneOwner ?? defaultFindVerifiedPhoneOwner,
    now: override?.now ?? (() => Date.now()),
  };
}

/* ------------------------------------------------------------- envio/checagem */

/**
 * Pede um código por SMS. Retorna sempre um objeto (nunca lança) para a tela
 * poder mostrar a mensagem certa; o código em si só existe na Twilio.
 */
export async function startPhoneVerification(
  input: { userId: string; phone: string },
  override?: Partial<PhoneVerificationDeps>,
): Promise<SendCodeResult> {
  const deps = await resolveDeps(override);

  const parsed = parsePhone(input.phone);
  if (!parsed.ok) {
    return sendFailure("invalid_phone", invalidPhoneMessage(parsed.reason));
  }
  const maskedPhone = maskPhone(parsed.e164);

  if (!deps.config) {
    console.error(
      `[CompensAI] Twilio Verify não configurado: defina ${deps.missing.join(", ") || "as variáveis TWILIO_*"} nas Secrets.`,
    );
    return sendFailure("not_configured", NOT_CONFIGURED_MESSAGE, { maskedPhone });
  }

  const nowMs = deps.now();
  const state = await deps.loadState(input.userId);
  const decision = evaluateSend({ state, phone: parsed.e164, nowMs });

  if (!decision.allowed) {
    const message =
      decision.reason === "already_verified"
        ? "Este celular já está confirmado nesta conta."
        : decision.reason === "cooldown"
          ? `Aguarde ${formatRetryAfter(decision.retry_after_seconds)} para pedir outro código.`
          : `Você pediu muitos códigos. Aguarde ${formatRetryAfter(
              decision.retry_after_seconds,
            )} para tentar de novo.`;
    const reason: SendCodeReason =
      decision.reason === "already_verified"
        ? "already_verified"
        : decision.reason === "cooldown"
          ? "cooldown"
          : "too_many_sends";
    return sendFailure(reason, message, {
      retryAfter: decision.retry_after_seconds,
      maskedPhone,
    });
  }

  const owner = await deps.findVerifiedPhoneOwner(parsed.e164, input.userId);
  if (owner) {
    return sendFailure(
      "phone_in_use",
      "Este celular já foi confirmado em outra conta do CompensAI. Cada celular vale para uma conta.",
      { maskedPhone },
    );
  }

  const response = await requestVerification(deps.config, parsed.e164, deps.fetchImpl);
  if (!response.ok) {
    console.error(
      `[CompensAI] Twilio Verify recusou o envio: ${response.error.kind} ${
        response.error.code ?? "-"
      } ${response.error.message}`,
    );
    return {
      ok: false,
      reason: reasonForProviderError(response.error),
      message: messageForProviderError(response.error, "send"),
      retry_after_seconds: null,
      masked_phone: maskedPhone,
      provider_error: response.error,
    };
  }

  const next = nextSendState(state, parsed.e164, nowMs);
  try {
    await deps.saveState(input.userId, next);
  } catch (error) {
    // O SMS já foi solicitado: reportar falha só confundiria a pessoa.
    console.error(
      "[CompensAI] código de SMS solicitado, mas o estado não foi salvo:",
      error instanceof Error ? error.message : error,
    );
  }

  return {
    ok: true,
    reason: "sent",
    message: `Código enviado por SMS para ${maskedPhone}. Ele vale por 10 minutos.`,
    retry_after_seconds: PHONE_RESEND_COOLDOWN_SECONDS,
    masked_phone: maskedPhone,
    provider_error: null,
  };
}

/**
 * Valida o código digitado. Um código já aprovado não pode ser reaproveitado
 * (estado confirmado) e a Twilio também invalida o código após o uso.
 */
export async function checkPhoneVerification(
  input: { userId: string; phone: string; code: string },
  override?: Partial<PhoneVerificationDeps>,
): Promise<CheckCodeResult> {
  const deps = await resolveDeps(override);

  const parsed = parsePhone(input.phone);
  if (!parsed.ok) {
    return checkFailure("invalid_phone", invalidPhoneMessage(parsed.reason));
  }

  const code = typeof input.code === "string" ? input.code.trim() : "";
  if (!new RegExp(`^\\d{${PHONE_CODE_MIN_LENGTH},${PHONE_CODE_MAX_LENGTH}}$`).test(code)) {
    return checkFailure("invalid_code", "Digite o código numérico que chegou por SMS.");
  }

  if (!deps.config) {
    console.error(
      `[CompensAI] Twilio Verify não configurado: defina ${deps.missing.join(", ") || "as variáveis TWILIO_*"} nas Secrets.`,
    );
    return checkFailure("not_configured", NOT_CONFIGURED_MESSAGE);
  }

  const nowMs = deps.now();
  const state = await deps.loadState(input.userId);
  const decision = evaluateCheck({ state, phone: parsed.e164, nowMs });

  if (!decision.allowed) {
    const message =
      decision.reason === "already_verified"
        ? "Este celular já está confirmado nesta conta."
        : decision.reason === "no_pending"
          ? "Peça um código antes de confirmar."
          : decision.reason === "phone_mismatch"
            ? "O código foi enviado para outro número. Informe o mesmo celular que recebeu o SMS."
            : decision.reason === "expired"
              ? "O código expirou. Peça um novo código."
              : `Muitas tentativas. Aguarde ${formatRetryAfter(
                  decision.retry_after_seconds,
                )} para tentar de novo.`;
    const reason: CheckCodeReason =
      decision.reason === "already_verified"
        ? "already_verified"
        : decision.reason === "no_pending"
          ? "no_pending"
          : decision.reason === "phone_mismatch"
            ? "phone_mismatch"
            : decision.reason === "expired"
              ? "expired"
              : "locked";
    return checkFailure(reason, message, {
      attemptsRemaining: decision.attempts_remaining,
      retryAfter: decision.retry_after_seconds,
    });
  }

  const response = await checkVerificationCode(deps.config, parsed.e164, code, deps.fetchImpl);

  if (!response.ok) {
    const error = response.error;
    console.error(
      `[CompensAI] Twilio Verify recusou a checagem: ${error.kind} ${error.code ?? "-"} ${
        error.message
      }`,
    );

    if (error.kind === "too_many_attempts") {
      const blocked = state ? lockedState(state, nowMs) : null;
      if (blocked) {
        try {
          await deps.saveState(input.userId, blocked);
        } catch (saveError) {
          console.error(
            "[CompensAI] falha ao registrar o bloqueio de tentativas:",
            saveError instanceof Error ? saveError.message : saveError,
          );
        }
      }
      return {
        ok: false,
        verified: false,
        reason: "locked",
        message: messageForProviderError(error, "check"),
        attempts_remaining: 0,
        retry_after_seconds: PHONE_LOCK_SECONDS,
        provider_error: error,
      };
    }

    return {
      ok: false,
      verified: false,
      reason: error.kind === "service_not_found" ? "expired" : reasonForProviderError(error),
      message: messageForProviderError(error, "check"),
      attempts_remaining: decision.attempts_remaining,
      retry_after_seconds: null,
      provider_error: error,
    };
  }

  const status = typeof response.body?.["status"] === "string" ? response.body["status"] : "";

  if (status === "approved") {
    const owner = await deps.findVerifiedPhoneOwner(parsed.e164, input.userId);
    if (owner) {
      return checkFailure(
        "phone_in_use",
        "Este celular já foi confirmado em outra conta do CompensAI. Cada celular vale para uma conta.",
      );
    }

    const verified = state
      ? nextVerifiedState(state, parsed.e164, nowMs)
      : {
          phone: parsed.e164,
          verified_at: new Date(nowMs).toISOString(),
          last_sent_at: null,
          sends: [],
          attempts: 0,
          locked_until: null,
        };
    try {
      await deps.saveState(input.userId, verified);
    } catch (error) {
      console.error(
        "[CompensAI] celular confirmado, mas o estado não foi salvo:",
        error instanceof Error ? error.message : error,
      );
      return checkFailure(
        "provider_error",
        "O código foi aceito, mas não conseguimos salvar a confirmação. Tente novamente.",
      );
    }

    return {
      ok: true,
      verified: true,
      reason: "verified",
      message: `Celular confirmado: ${maskPhone(parsed.e164)}.`,
      attempts_remaining: 0,
      retry_after_seconds: null,
      provider_error: null,
    };
  }

  // Código errado: a Twilio responde 200 com `status: "pending"`.
  const next = state ? nextFailedAttempt(state, nowMs) : null;
  const attemptsRemaining = next
    ? Math.max(0, PHONE_MAX_CHECK_ATTEMPTS - next.attempts)
    : decision.attempts_remaining - 1;

  if (next) {
    try {
      await deps.saveState(input.userId, next);
    } catch (error) {
      console.error(
        "[CompensAI] falha ao registrar tentativa de código:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (attemptsRemaining <= 0) {
    return checkFailure(
      "locked",
      `Muitas tentativas. Aguarde ${formatRetryAfter(PHONE_LOCK_SECONDS)} e peça um novo código.`,
      { attemptsRemaining: 0, retryAfter: PHONE_LOCK_SECONDS },
    );
  }

  return checkFailure(
    "invalid_code",
    `Código incorreto. ${attemptsRemaining} tentativa${attemptsRemaining === 1 ? "" : "s"} restante${
      attemptsRemaining === 1 ? "" : "s"
    }.`,
    { attemptsRemaining },
  );
}

/* ------------------------------------------------------------------- status */

async function defaultEntitlementState(userId: string): Promise<string | null> {
  try {
    const { getEntitlementForUser } = await import("@/lib/entitlement.server");
    const entitlement = await getEntitlementForUser(userId);
    return entitlement.state;
  } catch (error) {
    // Falha ao ler o acesso nunca pode bloquear o app por causa do celular.
    console.error(
      "[CompensAI] não foi possível ler o acesso para o gate de celular:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** Situação do celular para a tela (Perfil e gate). */
export async function getPhoneStatusForUser(
  userId: string,
  override?: Partial<PhoneVerificationDeps> & { entitlement_state?: string | null },
): Promise<PhoneStatus> {
  const { entitlement_state: entitlementOverride, ...depsOverride } = override ?? {};
  const entitlementState =
    entitlementOverride !== undefined ? entitlementOverride : await defaultEntitlementState(userId);

  const deps = await resolveDeps(depsOverride);
  const state = await deps.loadState(userId);
  const nowMs = deps.now();
  const required = phoneVerificationRequired(envRecord());
  const configured = deps.config !== null;
  const verified = !!state?.verified_at && !!state?.phone;

  const pendingDecision = evaluateCheck({ state, phone: state?.phone ?? "", nowMs });
  const pending = !verified && pendingDecision.reason === "ok";
  const sendDecision = evaluateSend({ state, phone: state?.phone ?? "", nowMs });

  return {
    configured,
    required,
    // Gate só vale com SMS configurado: sem credencial ninguém fica preso.
    gate_applies: configured && phoneGateApplies(entitlementState, required),
    verified,
    phone_masked: state?.phone ? maskPhone(state.phone) : null,
    verified_at: state?.verified_at ?? null,
    pending,
    can_resend_in_seconds: verified ? 0 : sendDecision.retry_after_seconds,
    attempts_remaining: pendingDecision.attempts_remaining,
    missing: deps.missing,
  };
}

/* --------------------------------------------------------------- diagnóstico */

/**
 * `GET /api/public/twilio-status`
 *
 * Mostra **se** as variáveis existem e se o formato parece correto — nunca o
 * valor. Com `?live=1` faz um GET no serviço Verify (sem enviar SMS, sem custo)
 * para confirmar credencial + Service SID de verdade.
 */
export async function handleTwilioStatus(
  request: Request,
  override?: Partial<PhoneVerificationDeps>,
): Promise<Response> {
  const env = envRecord();
  const { config, missing } = readTwilioConfig(env);
  const url = new URL(request.url);
  const wantLive = url.searchParams.get("live") === "1" || url.searchParams.get("live") === "true";

  const body: Record<string, unknown> = {
    ok: true,
    endpoint: "twilio-status",
    twilio: twilioConfigStatus(env),
  };

  if (wantLive) {
    if (!config) {
      body["live"] = { checked: false, ok: false, reason: "not_configured", missing };
    } else {
      const fetchImpl = override?.fetchImpl ?? (fetch as unknown as FetchImpl);
      const result = await checkVerifyService(config, fetchImpl);
      body["live"] = result.ok
        ? { checked: true, ok: true, status: result.status }
        : {
            checked: true,
            ok: false,
            status: result.status,
            error_kind: result.error.kind,
            error_code: result.error.code,
            error_message: result.error.message,
          };
    }
  }

  return json(body);
}

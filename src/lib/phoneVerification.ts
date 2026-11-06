/**
 * Confirmação de celular por SMS (Twilio Verify) — regras PURAS.
 *
 * Este arquivo não importa nada e não fala com a rede: ele só valida o número,
 * decide se pode enviar/checar e descreve o estado guardado. Serve para a UI,
 * para o servidor e para os testes com `node scripts/phoneVerification.test.ts`.
 *
 * Divisão de responsabilidades:
 *
 *  - Twilio Verify é quem GERA e VALIDA o código (nenhum código nosso é
 *    inventado, salvo ou comparado aqui);
 *  - o backend guarda apenas o estado da conta (celular pendente/confirmado,
 *    último envio, tentativas, bloqueio) em `app_metadata.compensai_phone`;
 *  - as credenciais ficam exclusivamente nas Secrets do servidor.
 */

/* ---------------------------------------------------------------- constantes */

/** Chave do estado no `app_metadata` (separada de `compensai`/billing). */
export const PHONE_META_KEY = "compensai_phone";

/** Intervalo mínimo entre dois pedidos de código (Twilio também limita). */
export const PHONE_RESEND_COOLDOWN_SECONDS = 60;

/** Janela do teto de envios por conta. */
export const PHONE_SEND_WINDOW_SECONDS = 60 * 60;

/** Máximo de códigos pedidos dentro da janela (antiabuso). */
export const PHONE_MAX_SENDS_PER_WINDOW = 5;

/** Máximo de tentativas de código errado antes de bloquear temporariamente. */
export const PHONE_MAX_CHECK_ATTEMPTS = 5;

/** Validade local do código (a Twilio Verify usa 10 minutos por padrão). */
export const PHONE_CODE_TTL_SECONDS = 10 * 60;

/** Duração do bloqueio depois de estourar as tentativas. */
export const PHONE_LOCK_SECONDS = 15 * 60;

/** Tamanho aceito do código (a Twilio usa 6; não fixamos o formato do provedor). */
export const PHONE_CODE_MIN_LENGTH = 4;
export const PHONE_CODE_MAX_LENGTH = 10;

/* -------------------------------------------------------------- telefone */

export type PhoneInvalidReason =
  | "empty"
  | "invalid_characters"
  | "too_short"
  | "too_long"
  | "invalid_ddd"
  | "not_mobile"
  | "invalid_country";

export type PhoneParseResult =
  | { ok: true; e164: string; national: string; country_code: string }
  | { ok: false; reason: PhoneInvalidReason };

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Converte o que a pessoa digitou em E.164.
 *
 * - aceita `(51) 98583-9571`, `51 9 8583 9571`, `51985839571`, `+55 51 ...`;
 * - número sem `+` e sem DDI é tratado como brasileiro (DDD + celular);
 * - celular brasileiro precisa de 11 dígitos com o `9` depois do DDD
 *   (telefone fixo é recusado: SMS não entrega em fixo);
 * - outros países só são aceitos com `+` (evita adivinhar DDI errado).
 */
export function parsePhone(input: unknown): PhoneParseResult {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return { ok: false, reason: "empty" };
  if (!/^[\d\s()+\-./]+$/.test(raw)) return { ok: false, reason: "invalid_characters" };

  let digits = digitsOnly(raw);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 8) return { ok: false, reason: "too_short" };
  if (digits.length > 15) return { ok: false, reason: "too_long" };

  const explicitCountry = raw.startsWith("+") || raw.startsWith("00");
  let countryCode: string;
  let national: string;

  if (!explicitCountry && digits.length <= 11) {
    // Sem DDI: é o formato brasileiro (DDD + número).
    countryCode = "55";
    national = digits;
  } else if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) {
    countryCode = "55";
    national = digits.slice(2);
  } else if (explicitCountry) {
    // Internacional: código de país de 1 a 3 dígitos; o resto é o número.
    countryCode = digits.startsWith("1") ? "1" : digits.slice(0, 2);
    national = digits.slice(countryCode.length);
    if (national.length < 6) return { ok: false, reason: "too_short" };
  } else {
    // Sem "+" e sem 55 não há como saber o país — melhor recusar do que errar.
    return { ok: false, reason: "invalid_country" };
  }

  if (countryCode === "55") {
    if (national.length < 11) return { ok: false, reason: "too_short" };
    if (national.length > 11) return { ok: false, reason: "too_long" };
    const ddd = Number(national.slice(0, 2));
    if (!Number.isInteger(ddd) || ddd < 11 || ddd > 99) {
      return { ok: false, reason: "invalid_ddd" };
    }
    if (national.charAt(2) !== "9") return { ok: false, reason: "not_mobile" };
  }

  return { ok: true, e164: `+${countryCode}${national}`, national, country_code: countryCode };
}

/** `+55 51 •••••9571` — para tela e para logs (nunca o número inteiro). */
export function maskPhone(value: string): string {
  const digits = digitsOnly(value);
  if (digits.length < 8) return "•••";
  const countryCode = digits.startsWith("55") ? "55" : digits.slice(0, 1);
  const national = digits.slice(countryCode.length);
  if (national.length < 6) return `+${countryCode} ••••`;
  const head = national.slice(0, 2);
  const tail = national.slice(-4);
  const hidden = Math.max(3, national.length - head.length - tail.length);
  return `+${countryCode} ${head} ${"•".repeat(hidden)}${tail}`;
}

/* ------------------------------------------------------------ estado salvo */

export type PhoneVerificationState = {
  /** E.164 do último número usado nesta conta. */
  phone: string;
  /** ISO de quando o número foi confirmado pela Twilio. */
  verified_at: string | null;
  /** ISO do último pedido de código. */
  last_sent_at: string | null;
  /** Pedidos de código dentro da janela (ISO, mais antigos primeiro). */
  sends: string[];
  /** Tentativas erradas do código atual. */
  attempts: number;
  /** ISO até quando a conta está bloqueada por excesso de tentativas. */
  locked_until: string | null;
};

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Lê o estado do `app_metadata` sem confiar no formato (dado gravado pelo servidor). */
export function readPhoneState(appMetadata: unknown): PhoneVerificationState | null {
  if (!appMetadata || typeof appMetadata !== "object" || Array.isArray(appMetadata)) return null;
  const raw = (appMetadata as Record<string, unknown>)[PHONE_META_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const phone = typeof value["phone"] === "string" ? value["phone"].trim() : "";
  if (!phone) return null;

  const sends = Array.isArray(value["sends"])
    ? value["sends"]
        .map((entry) => isoOrNull(entry))
        .filter((entry): entry is string => entry !== null)
        .slice(-PHONE_MAX_SENDS_PER_WINDOW * 3)
    : [];

  const attemptsRaw = value["attempts"];
  const attempts =
    typeof attemptsRaw === "number" && Number.isFinite(attemptsRaw)
      ? Math.max(0, Math.min(99, Math.floor(attemptsRaw)))
      : 0;

  return {
    phone,
    verified_at: isoOrNull(value["verified_at"]),
    last_sent_at: isoOrNull(value["last_sent_at"]),
    sends,
    attempts,
    locked_until: isoOrNull(value["locked_until"]),
  };
}

/* --------------------------------------------------------------- decisões */

function secondsSince(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, (nowMs - ms) / 1000);
}

function msUntil(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return ms - nowMs;
}

export type SendDecisionReason = "ok" | "already_verified" | "cooldown" | "too_many_sends";

export type SendDecision = {
  allowed: boolean;
  reason: SendDecisionReason;
  /** Segundos até poder pedir de novo (`0` quando liberado). */
  retry_after_seconds: number;
};

/**
 * Pode pedir um novo código agora?
 *
 * Regras: celular já confirmado não recebe código; 60 s entre pedidos; no
 * máximo 5 pedidos por hora **por conta** (trocar de número não zera o teto).
 */
export function evaluateSend(input: {
  state: PhoneVerificationState | null;
  phone: string;
  nowMs: number;
}): SendDecision {
  const { state, phone, nowMs } = input;

  if (state?.verified_at && state.phone === phone) {
    return { allowed: false, reason: "already_verified", retry_after_seconds: 0 };
  }

  const sinceLast = secondsSince(state?.last_sent_at ?? null, nowMs);
  if (sinceLast !== null && sinceLast < PHONE_RESEND_COOLDOWN_SECONDS) {
    return {
      allowed: false,
      reason: "cooldown",
      retry_after_seconds: Math.max(1, Math.ceil(PHONE_RESEND_COOLDOWN_SECONDS - sinceLast)),
    };
  }

  const windowStart = nowMs - PHONE_SEND_WINDOW_SECONDS * 1000;
  const recent = (state?.sends ?? [])
    .map((iso) => Date.parse(iso))
    .filter((ms) => Number.isFinite(ms) && ms >= windowStart);

  if (recent.length >= PHONE_MAX_SENDS_PER_WINDOW) {
    const oldest = Math.min(...recent);
    const waitMs = oldest + PHONE_SEND_WINDOW_SECONDS * 1000 - nowMs;
    return {
      allowed: false,
      reason: "too_many_sends",
      retry_after_seconds: Math.max(1, Math.ceil(waitMs / 1000)),
    };
  }

  return { allowed: true, reason: "ok", retry_after_seconds: 0 };
}

export type CheckDecisionReason =
  "ok" | "already_verified" | "no_pending" | "phone_mismatch" | "expired" | "locked";

export type CheckDecision = {
  allowed: boolean;
  reason: CheckDecisionReason;
  attempts_remaining: number;
  /** Segundos até liberar (usado no bloqueio). */
  retry_after_seconds: number;
};

/**
 * Pode validar um código agora?
 *
 * - celular já confirmado não aceita código de novo (impede reutilização);
 * - precisa existir um código pendente para o MESMO número;
 * - o código expira em 10 minutos;
 * - depois de 5 erros a conta fica bloqueada por 15 minutos.
 */
export function evaluateCheck(input: {
  state: PhoneVerificationState | null;
  phone: string;
  nowMs: number;
}): CheckDecision {
  const { state, phone, nowMs } = input;
  const remainingFrom = (attempts: number) => Math.max(0, PHONE_MAX_CHECK_ATTEMPTS - attempts);

  if (!state) {
    return {
      allowed: false,
      reason: "no_pending",
      attempts_remaining: PHONE_MAX_CHECK_ATTEMPTS,
      retry_after_seconds: 0,
    };
  }

  if (state.verified_at && state.phone === phone) {
    return {
      allowed: false,
      reason: "already_verified",
      attempts_remaining: PHONE_MAX_CHECK_ATTEMPTS,
      retry_after_seconds: 0,
    };
  }

  if (state.phone !== phone || !state.last_sent_at) {
    return {
      allowed: false,
      reason: "phone_mismatch",
      attempts_remaining: remainingFrom(state.attempts),
      retry_after_seconds: 0,
    };
  }

  const lockedFor = msUntil(state.locked_until, nowMs);
  if (lockedFor !== null && lockedFor > 0) {
    return {
      allowed: false,
      reason: "locked",
      attempts_remaining: 0,
      retry_after_seconds: Math.ceil(lockedFor / 1000),
    };
  }

  const sinceSent = secondsSince(state.last_sent_at, nowMs) ?? Number.POSITIVE_INFINITY;
  if (sinceSent > PHONE_CODE_TTL_SECONDS) {
    return {
      allowed: false,
      reason: "expired",
      attempts_remaining: remainingFrom(state.attempts),
      retry_after_seconds: 0,
    };
  }

  const remaining = remainingFrom(state.attempts);
  if (remaining <= 0) {
    return {
      allowed: false,
      reason: "locked",
      attempts_remaining: 0,
      retry_after_seconds: PHONE_LOCK_SECONDS,
    };
  }

  return { allowed: true, reason: "ok", attempts_remaining: remaining, retry_after_seconds: 0 };
}

/* --------------------------------------------------------------- redutores */

/** Estado depois de um pedido de código aceito pela Twilio. */
export function nextSendState(
  state: PhoneVerificationState | null,
  phone: string,
  nowMs: number,
): PhoneVerificationState {
  const nowIso = new Date(nowMs).toISOString();
  const windowStart = nowMs - PHONE_SEND_WINDOW_SECONDS * 1000;
  const history = (state?.sends ?? []).filter((iso) => {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) && ms >= windowStart;
  });
  return {
    phone,
    // Trocar de número descarta a confirmação anterior (um celular por conta).
    verified_at: state && state.phone === phone ? state.verified_at : null,
    last_sent_at: nowIso,
    sends: [...history, nowIso],
    attempts: 0,
    locked_until: null,
  };
}

/** Estado depois de um código errado. Bloqueia ao chegar no limite. */
export function nextFailedAttempt(
  state: PhoneVerificationState,
  nowMs: number,
): PhoneVerificationState {
  const attempts = state.attempts + 1;
  const blocked = attempts >= PHONE_MAX_CHECK_ATTEMPTS;
  return {
    ...state,
    attempts,
    locked_until: blocked
      ? new Date(nowMs + PHONE_LOCK_SECONDS * 1000).toISOString()
      : state.locked_until,
  };
}

/** Estado depois da confirmação: código já usado nunca mais vale. */
export function nextVerifiedState(
  state: PhoneVerificationState,
  phone: string,
  nowMs: number,
): PhoneVerificationState {
  return {
    phone,
    verified_at: new Date(nowMs).toISOString(),
    last_sent_at: state.last_sent_at,
    sends: [],
    attempts: 0,
    locked_until: null,
  };
}

/** Bloqueio imediato (usado quando a própria Twilio responde "tentativas demais"). */
export function lockedState(state: PhoneVerificationState, nowMs: number): PhoneVerificationState {
  return {
    ...state,
    attempts: PHONE_MAX_CHECK_ATTEMPTS,
    locked_until: new Date(nowMs + PHONE_LOCK_SECONDS * 1000).toISOString(),
  };
}

/* ------------------------------------------------------------------ gate */

/**
 * O gate de verificação só liga com `PHONE_VERIFICATION_REQUIRED=true`.
 * Desligado por padrão: nada muda para quem já usa o app (trial e assinatura
 * continuam exatamente como estão) até o dono autorizar depois do teste real.
 */
export function phoneVerificationRequired(env: Record<string, string | undefined>): boolean {
  const raw = env["PHONE_VERIFICATION_REQUIRED"];
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
}

/**
 * O gate vale para esta situação de acesso?
 *
 * Só para o teste gratuito em andamento. Assinatura paga, conta administradora,
 * pagamento em análise e trial encerrado nunca são bloqueados por causa do
 * celular — essa decisão continua sendo só do `entitlement`.
 */
export function phoneGateApplies(
  entitlementState: string | null | undefined,
  required: boolean,
): boolean {
  if (!required) return false;
  return entitlementState === "trial";
}

/* --------------------------------------------------------------- mensagens */

export function formatRetryAfter(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return "alguns segundos";
  const total = Math.ceil(seconds);
  if (total < 60) return `${total} s`;
  const minutes = Math.ceil(total / 60);
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}

export function invalidPhoneMessage(reason: PhoneInvalidReason): string {
  switch (reason) {
    case "empty":
      return "Informe seu celular com DDD.";
    case "invalid_characters":
      return "Use apenas números, espaços, parênteses e o + do código do país.";
    case "too_short":
      return "Número incompleto. Informe o celular com DDD (ex.: 51 98583-9571).";
    case "too_long":
      return "Número muito longo. Confira o celular com DDD.";
    case "invalid_ddd":
      return "O DDD informado não existe. Confira o número.";
    case "not_mobile":
      return "Esse número não parece ser um celular. Informe um celular com DDD.";
    case "invalid_country":
      return "Informe o número com o código do país (ex.: +55 51 98583-9571).";
  }
  return "Informe um celular válido com DDD.";
}

/* ---------------------------------------------------------------- contratos */

export type PhoneProviderErrorKind =
  | "auth_failed"
  | "service_not_found"
  | "invalid_phone"
  | "not_mobile"
  | "number_not_verified"
  | "region_not_enabled"
  | "blocked"
  | "too_many_attempts"
  | "rate_limited"
  | "network"
  | "unknown";

export type PhoneProviderError = {
  kind: PhoneProviderErrorKind;
  /** Código de erro da Twilio (nunca contém credencial). */
  code: number | null;
  /** Mensagem do provedor já saneada (sem telefone e sem credencial). */
  message: string;
  /**
   * Categoria técnica da falha de transporte (`dns`, `connection`, `tls`,
   * `timeout`, `invalid_url`, `cannot_load`, `egress_blocked`,
   * `subrequest_limit`, `fetch_failed:<Name>`), opcionalmente com o código
   * conhecido (`dns:EAI_AGAIN`). Serve só para diagnóstico: nunca contém URL,
   * telefone, credencial nem a mensagem original da exceção.
   */
  detail?: string;
  /**
   * Nome da exceção de transporte já validado (`TypeError`, `AbortError`, ...).
   * `null` quando o nome não passa no formato seguro.
   */
  errorName?: string | null;
  /**
   * Código de sistema conhecido (`EAI_AGAIN`, `ENOTFOUND`, `ECONNREFUSED`,
   * `UND_ERR_CONNECT_TIMEOUT`, `CERT_HAS_EXPIRED`, ...). Só sai daqui código
   * da allowlist fechada; qualquer outro vira `null`.
   */
  causeCode?: string | null;
};

export type SendCodeReason =
  | "sent"
  | "invalid_phone"
  | "not_configured"
  | "cooldown"
  | "too_many_sends"
  | "already_verified"
  | "phone_in_use"
  | "provider_error";

export type SendCodeResult = {
  ok: boolean;
  reason: SendCodeReason;
  message: string;
  retry_after_seconds: number | null;
  masked_phone: string | null;
  provider_error: PhoneProviderError | null;
};

export type CheckCodeReason =
  | "verified"
  | "invalid_code"
  | "expired"
  | "locked"
  | "no_pending"
  | "phone_mismatch"
  | "already_verified"
  | "invalid_phone"
  | "not_configured"
  | "phone_in_use"
  | "provider_error";

export type CheckCodeResult = {
  ok: boolean;
  verified: boolean;
  reason: CheckCodeReason;
  message: string;
  attempts_remaining: number;
  retry_after_seconds: number | null;
  provider_error: PhoneProviderError | null;
};

export type PhoneStatus = {
  /** Credenciais da Twilio disponíveis no backend? */
  configured: boolean;
  /** `PHONE_VERIFICATION_REQUIRED=true`? */
  required: boolean;
  /** O gate bloqueia esta conta agora? */
  gate_applies: boolean;
  verified: boolean;
  phone_masked: string | null;
  verified_at: string | null;
  /** Existe código pendente (enviado e dentro da validade)? */
  pending: boolean;
  can_resend_in_seconds: number;
  attempts_remaining: number;
  /** Nomes das variáveis que faltam (sem valores). */
  missing: string[];
};

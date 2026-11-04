/**
 * Alerta de novo cadastro no CompensAI.
 *
 * Este módulo é PURO e autocontido (sem imports) para poder ser testado com
 * `node scripts/signupAlert.test.ts`. Ele monta as mensagens e faz a entrega em
 * dois canais, com o `fetch` injetável:
 *
 *  - E-MAIL  → API do Resend (`https://api.resend.com/emails`)
 *  - WHATSAPP → Meta Cloud API (oficial) OU CallMeBot (pessoal, sem burocracia)
 *
 * Nenhuma credencial fica aqui: os valores vêm das Secrets do Lovable Cloud e
 * são lidos por `signupAlertChannels`. Canal sem credencial é simplesmente
 * ignorado (`skipped`) — o app nunca quebra por causa do alerta.
 */

/** Destinatários do dono do app (fixos, de propósito). */
export const SIGNUP_ALERT_EMAIL_TO = "compens.aai@gmail.com";
export const SIGNUP_ALERT_WHATSAPP_TO = "5551985839571";

/** Remetente padrão do e-mail (funciona sem domínio verificado no Resend). */
export const SIGNUP_ALERT_DEFAULT_FROM = "CompensAI <onboarding@resend.dev>";

export type SignupAlertPayload = {
  /** Nome que a pessoa informou (ou o nome da conta Google). */
  name: string | null;
  email: string | null;
  /** ISO de quando a conta foi criada. */
  createdAt: string | null;
  /** Como entrou: `email`, `google`, etc. */
  origin: string | null;
};

export type SignupAlertChannelStatus = "sent" | "skipped" | "failed";

export type SignupAlertDelivery = {
  email: SignupAlertChannelStatus;
  whatsapp: SignupAlertChannelStatus;
  email_provider: string | null;
  whatsapp_provider: string | null;
  errors: string[];
};

export type SignupAlertChannels = {
  resend: { apiKey: string; from: string; to: string } | null;
  callMeBot: { apiKey: string; phone: string } | null;
  whatsappCloud: { token: string; phoneId: string; to: string } | null;
};

const MAX_ERROR = 300;

function clean(value: unknown, max = 200): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function originLabel(origin: string): string {
  const value = origin.trim().toLowerCase();
  if (value === "google") return "Google";
  if (value === "email") return "E-mail e senha";
  if (value === "") return "Não informado";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** `03/11/2026 às 14:32` no horário de Brasília (ou o ISO cru se der erro). */
export function formatAlertDate(iso: string | null): string {
  if (!iso) return "Agora";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Agora";
  try {
    const formatted = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(date);
    return formatted.replace(",", " às");
  } catch {
    return date.toISOString();
  }
}

export type SignupAlertMessage = {
  subject: string;
  text: string;
  html: string;
  whatsappText: string;
};

/** Mensagens do alerta (as três versões: assunto, texto, HTML e WhatsApp). */
export function buildSignupAlert(payload: SignupAlertPayload): SignupAlertMessage {
  const name = clean(payload.name) || "Não informado";
  const email = clean(payload.email) || "Não informado";
  const when = formatAlertDate(payload.createdAt);
  const origin = originLabel(clean(payload.origin));

  const subject = `🎉 Novo cadastro no CompensAI: ${name}`;

  const text = [
    "Novo cadastro no CompensAI",
    "",
    `Nome: ${name}`,
    `E-mail: ${email}`,
    `Entrou com: ${origin}`,
    `Data: ${when}`,
    "",
    "Enviado automaticamente pelo CompensAI.",
  ].join("\n");

  const whatsappText = [
    "🎉 *Novo cadastro no CompensAI*",
    "",
    `*Nome:* ${name}`,
    `*E-mail:* ${email}`,
    `*Entrou com:* ${origin}`,
    `*Data:* ${when}`,
  ].join("\n");

  const rows: Array<[string, string]> = [
    ["Nome", name],
    ["E-mail", email],
    ["Entrou com", origin],
    ["Data", when],
  ];

  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#0f1a17;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#e9f5ef">
    <div style="max-width:520px;margin:0 auto;border:1px solid rgba(64,224,160,0.35);border-radius:16px;overflow:hidden;background:#14231f">
      <div style="padding:18px 22px;background:linear-gradient(135deg,#2fe08a,#5ff0b3);color:#08221a">
        <p style="margin:0;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase">CompensAI</p>
        <h1 style="margin:6px 0 0;font-size:20px;line-height:1.25">🎉 Novo cadastro criado</h1>
      </div>
      <div style="padding:18px 22px">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${rows
            .map(
              ([label, value]) => `<tr>
            <td style="padding:8px 0;color:#8fb8a8;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>
            <td style="padding:8px 0 8px 14px;font-weight:700;word-break:break-word">${escapeHtml(value)}</td>
          </tr>`,
            )
            .join("\n          ")}
        </table>
        <p style="margin:18px 0 0;padding-top:14px;border-top:1px solid rgba(64,224,160,0.2);font-size:12px;color:#8fb8a8">
          Alerta automático do CompensAI. Nenhuma ação é necessária.
        </p>
      </div>
    </div>
  </body>
</html>`;

  return { subject, text, html, whatsappText };
}

/* --------------------------------------------------------------- provedores */

function read(channels: Record<string, string | undefined>, key: string): string {
  const value = channels[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Descobre quais canais estão configurados a partir das variáveis de ambiente.
 * Nada é obrigatório: sem credencial o canal fica `null` e é ignorado.
 */
export function signupAlertChannels(env: Record<string, string | undefined>): SignupAlertChannels {
  const resendKey = read(env, "RESEND_API_KEY");
  const callMeBotKey = read(env, "CALLMEBOT_API_KEY");
  const cloudToken = read(env, "WHATSAPP_CLOUD_TOKEN");
  const cloudPhoneId = read(env, "WHATSAPP_CLOUD_PHONE_ID");

  return {
    resend: resendKey
      ? {
          apiKey: resendKey,
          from: read(env, "SIGNUP_ALERT_FROM") || SIGNUP_ALERT_DEFAULT_FROM,
          to: read(env, "SIGNUP_ALERT_EMAIL_TO") || SIGNUP_ALERT_EMAIL_TO,
        }
      : null,
    callMeBot: callMeBotKey
      ? {
          apiKey: callMeBotKey,
          phone: read(env, "CALLMEBOT_PHONE") || SIGNUP_ALERT_WHATSAPP_TO,
        }
      : null,
    whatsappCloud:
      cloudToken && cloudPhoneId
        ? {
            token: cloudToken,
            phoneId: cloudPhoneId,
            to: read(env, "WHATSAPP_ALERT_TO") || SIGNUP_ALERT_WHATSAPP_TO,
          }
        : null,
  };
}

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

function shortError(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(/\s+/g, " ").slice(0, MAX_ERROR);
}

function timeoutSignal(): AbortSignal | undefined {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function")
    return undefined;
  return AbortSignal.timeout(8_000);
}

function withSignal(init: RequestInit): RequestInit {
  const signal = timeoutSignal();
  return signal ? { ...init, signal } : init;
}

async function postJson(
  fetchImpl: FetchImpl,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<void> {
  const response = await fetchImpl(
    url,
    withSignal({
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} ${detail.slice(0, 160)}`.trim());
  }
}

async function sendEmail(
  channels: SignupAlertChannels,
  message: SignupAlertMessage,
  fetchImpl: FetchImpl,
): Promise<{ status: SignupAlertChannelStatus; provider: string | null; error?: string }> {
  const resend = channels.resend;
  if (!resend) return { status: "skipped", provider: null };
  try {
    await postJson(
      fetchImpl,
      "https://api.resend.com/emails",
      { authorization: `Bearer ${resend.apiKey}` },
      {
        from: resend.from,
        to: [resend.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      },
    );
    return { status: "sent", provider: "resend" };
  } catch (error) {
    return { status: "failed", provider: "resend", error: `resend: ${shortError(error)}` };
  }
}

async function sendWhatsApp(
  channels: SignupAlertChannels,
  message: SignupAlertMessage,
  fetchImpl: FetchImpl,
): Promise<{ status: SignupAlertChannelStatus; provider: string | null; error?: string }> {
  const cloud = channels.whatsappCloud;
  if (cloud) {
    try {
      await postJson(
        fetchImpl,
        `https://graph.facebook.com/v20.0/${encodeURIComponent(cloud.phoneId)}/messages`,
        { authorization: `Bearer ${cloud.token}` },
        {
          messaging_product: "whatsapp",
          to: cloud.to,
          type: "text",
          text: { preview_url: false, body: message.whatsappText },
        },
      );
      return { status: "sent", provider: "whatsapp_cloud" };
    } catch (error) {
      return {
        status: "failed",
        provider: "whatsapp_cloud",
        error: `whatsapp_cloud: ${shortError(error)}`,
      };
    }
  }

  const bot = channels.callMeBot;
  if (!bot) return { status: "skipped", provider: null };

  try {
    const url =
      "https://api.callmebot.com/whatsapp.php" +
      `?phone=${encodeURIComponent(bot.phone)}` +
      `&text=${encodeURIComponent(message.whatsappText)}` +
      `&apikey=${encodeURIComponent(bot.apiKey)}`;
    const response = await fetchImpl(url, withSignal({ method: "GET" }));
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} ${detail.slice(0, 160)}`.trim());
    }
    return { status: "sent", provider: "callmebot" };
  } catch (error) {
    return { status: "failed", provider: "callmebot", error: `callmebot: ${shortError(error)}` };
  }
}

/**
 * Entrega o alerta nos dois canais, em paralelo. Nunca lança: devolve o
 * resultado de cada canal para quem chamou decidir se deve tentar de novo.
 */
export async function deliverSignupAlert(
  payload: SignupAlertPayload,
  channels: SignupAlertChannels,
  fetchImpl: FetchImpl = fetch as unknown as FetchImpl,
): Promise<SignupAlertDelivery> {
  const message = buildSignupAlert(payload);
  const [email, whatsapp] = await Promise.all([
    sendEmail(channels, message, fetchImpl),
    sendWhatsApp(channels, message, fetchImpl),
  ]);

  const errors = [email.error, whatsapp.error].filter((v): v is string => typeof v === "string");

  return {
    email: email.status,
    whatsapp: whatsapp.status,
    email_provider: email.provider,
    whatsapp_provider: whatsapp.provider,
    errors,
  };
}

/** Pelo menos um canal realmente entregou? */
export function deliveryReachedSomeone(delivery: SignupAlertDelivery): boolean {
  return delivery.email === "sent" || delivery.whatsapp === "sent";
}

/** Nenhum canal configurado (útil para avisar no log sem spammar erro). */
export function deliveryUnconfigured(delivery: SignupAlertDelivery): boolean {
  return delivery.email === "skipped" && delivery.whatsapp === "skipped";
}

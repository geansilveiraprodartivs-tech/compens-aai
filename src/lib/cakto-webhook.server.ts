/**
 * Webhook da Cakto — confirmação legítima de pagamento.
 *
 * Regras:
 *  - sem `CAKTO_WEBHOOK_SECRET` configurado a rota falha fechada (401);
 *  - a assinatura HMAC (`X-Cakto-Signature` = `v1=HMAC(secret, "{ts}.{corpo}")`)
 *    é verificada sobre o corpo CRU, com tolerância de 5 min (anti-replay);
 *  - o `secret` do corpo também é comparado (dupla checagem);
 *  - evento de ruído (checkout abandonado, pix gerado, etc.) responde 2xx sem
 *    tocar em conta nenhuma;
 *  - o evento é idempotente (deduplicado por `id`/`refId` do pedido);
 *  - falha de processamento responde 500 para a Cakto reenviar (a dedupe
 *    impede aplicar duas vezes);
 *  - nada é liberado por chamada do frontend.
 *
 * As dependências são injetáveis para que `node scripts/caktoWebhook.test.ts`
 * exercite o endpoint completo sem banco, sem rede e sem pagamento real.
 */
import { isNoiseEvent, verifyWebhookSignature } from "./entitlement.ts";
import type { WebhookApplyResult } from "./entitlement.server";

const MAX_BODY_BYTES = 256 * 1024;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type OrderData = Record<string, unknown>;

type ResolveUserInput = { callback: string | null; email: string | null };

export type WebhookDeps = {
  /** Segredo do webhook (`CAKTO_WEBHOOK_SECRET`); `null` desliga a rota. */
  secret: string | null;
  /** Liga o pedido ao dono: token de callback assinado e/ou e-mail do comprador. */
  resolveUser: (input: ResolveUserInput) => Promise<string | null>;
  /** Aplica o evento ao estado do usuário (idempotente). */
  apply: (
    userId: string,
    event: string,
    data: Record<string, unknown>,
  ) => Promise<WebhookApplyResult>;
  /** Relógio do servidor (injetável nos testes). */
  now: () => number;
};

function pickEmail(data: OrderData | null): string | null {
  const customer = data?.["customer"];
  if (customer && typeof customer === "object") {
    const email = (customer as { email?: unknown }).email;
    if (typeof email === "string" && email.trim() !== "") return email.trim();
  }
  const direct = data?.["customerEmail"];
  if (typeof direct === "string" && direct.trim() !== "") return direct.trim();
  return null;
}

function pickCallback(data: OrderData | null): string | null {
  const callback = data?.["callback"];
  return typeof callback === "string" && callback.trim() !== "" ? callback.trim() : null;
}

let cachedDefaults: WebhookDeps | null = null;

async function resolveDeps(override?: Partial<WebhookDeps>): Promise<WebhookDeps> {
  if (override?.secret !== undefined && override.resolveUser && override.apply) {
    return {
      secret: override.secret ?? null,
      resolveUser: override.resolveUser,
      apply: override.apply,
      now: override.now ?? (() => Date.now()),
    };
  }
  if (!cachedDefaults) {
    const server = await import("./entitlement.server");
    cachedDefaults = {
      secret: server.webhookSecret(),
      resolveUser: (input) => server.resolveBillingUser(input),
      apply: (userId, event, data) => server.applyCaktoEvent(userId, event, data),
      now: () => Date.now(),
    };
  }
  return { ...cachedDefaults, ...override };
}

/** GET de verificação: a Cakto (e você) conseguem confirmar que a rota existe. */
export function handleCaktoWebhookInfo(): Response {
  return json({ ok: true, endpoint: "cakto" });
}

export async function handleCaktoWebhook(
  request: Request,
  override?: Partial<WebhookDeps>,
): Promise<Response> {
  const deps = await resolveDeps(override);

  const secret = deps.secret;
  if (!secret) {
    console.error("[cakto] CAKTO_WEBHOOK_SECRET ausente — entrega recusada (fail closed).");
    return json({ ok: false, error: "webhook_not_configured" }, 401);
  }

  const rawBody = await request.text();
  if (!rawBody || new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return json({ ok: false, error: "invalid_body" }, 400);
  }

  // Sem assinatura válida nada é processado — nem o parse do JSON.
  const signatureValid = await verifyWebhookSignature({
    rawBody,
    timestamp: request.headers.get("x-cakto-timestamp"),
    signature: request.headers.get("x-cakto-signature"),
    secret,
    nowMs: deps.now(),
  });
  if (!signatureValid) {
    return json({ ok: false, error: "invalid_signature" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const bodySecret = typeof payload["secret"] === "string" ? payload["secret"] : "";
  if (!safeEqual(bodySecret, secret)) {
    return json({ ok: false, error: "invalid_secret" }, 401);
  }

  const event = typeof payload["event"] === "string" ? payload["event"] : "";
  if (!event) return json({ ok: false, error: "missing_event" }, 400);

  // Webhook V2 entrega `data` como lista (pedido principal + bumps/upsell).
  const rawData = payload["data"];
  const items: OrderData[] = Array.isArray(rawData)
    ? rawData.filter((v): v is OrderData => !!v && typeof v === "object" && !Array.isArray(v))
    : rawData && typeof rawData === "object"
      ? [rawData as OrderData]
      : [];

  if (isNoiseEvent(event)) {
    return json({ ok: true, event, ignored: items.length });
  }

  if (items.length === 0) {
    // Sem pedido não há o que liberar/bloquear.
    return json({ ok: true, event, ignored: 0 });
  }

  // Em pedidos com bumps, os itens extras podem não repetir os dados do
  // comprador; nesse caso herdamos os identificadores do primeiro item.
  const fallbackEmail = items.map((item) => pickEmail(item)).find((v) => v !== null) ?? null;
  const fallbackCallback = items.map((item) => pickCallback(item)).find((v) => v !== null) ?? null;

  let applied = 0;
  let skipped = 0;
  let unmapped = 0;
  let unknownUser = 0;
  let failed = 0;

  for (const data of items) {
    const email = pickEmail(data) ?? fallbackEmail;
    const callback = pickCallback(data) ?? fallbackCallback;

    if (!callback && !email) {
      unknownUser += 1;
      continue;
    }

    try {
      const userId = await deps.resolveUser({ callback, email });
      if (!userId) {
        unknownUser += 1;
        console.warn(`[cakto] evento ${event} sem conta correspondente no CompensAI`);
        continue;
      }

      const result = await deps.apply(userId, event, data);
      if (result.applied) applied += 1;
      else skipped += 1;
      if (result.result === "unmapped") unmapped += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `[cakto] falha ao processar ${event}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  const ok = failed === 0;
  const counters = { event, applied, skipped, unmapped, unknownUser, failed };
  if (!ok) {
    // 500 faz a Cakto marcar a entrega como falha e permitir reenvio; a
    // deduplicação garante que os itens já aplicados não sejam repetidos.
    return json({ ok: false, error: "processing_failed", ...counters }, 500);
  }
  return json({ ok: true, ...counters });
}

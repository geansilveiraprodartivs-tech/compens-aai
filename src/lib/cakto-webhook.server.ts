/**
 * Webhook da Cakto — confirmação legítima de pagamento.
 *
 * Regras:
 *  - sem `CAKTO_WEBHOOK_SECRET` configurado a rota falha fechada (401);
 *  - a assinatura HMAC (`X-Cakto-Signature`) é verificada sobre o corpo cru;
 *  - o `secret` do corpo também é comparado;
 *  - o evento é idempotente (deduplicado por `id` do pedido);
 *  - nada é liberado por chamada do frontend.
 */
import { verifyWebhookSignature } from "./entitlement";
import { applyCaktoEvent, resolveBillingUser, webhookSecret } from "./entitlement.server";

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

function pickEmail(data: OrderData | null): string | null {
  const customer = data?.["customer"] as { email?: unknown } | undefined;
  if (customer && typeof customer.email === "string") return customer.email;
  if (typeof data?.["customerEmail"] === "string") return data["customerEmail"];
  return null;
}

function pickCallback(data: OrderData | null): string | null {
  return typeof data?.["callback"] === "string" ? data["callback"] : null;
}

export async function handleCaktoWebhook(request: Request): Promise<Response> {
  const secret = webhookSecret();
  if (!secret) {
    console.error("[cakto] CAKTO_WEBHOOK_SECRET ausente — entrega recusada (fail closed).");
    return json({ ok: false, error: "webhook_not_configured" }, 401);
  }

  const rawBody = await request.text();
  if (!rawBody || rawBody.length > MAX_BODY_BYTES) {
    return json({ ok: false, error: "invalid_body" }, 400);
  }

  const timestamp = request.headers.get("x-cakto-timestamp");
  const signature = request.headers.get("x-cakto-signature");

  const signatureValid = await verifyWebhookSignature({ rawBody, timestamp, signature, secret });
  const hasHeaders = !!timestamp || !!signature;
  if (hasHeaders && !signatureValid) {
    return json({ ok: false, error: "invalid_signature" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
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
    ? rawData.filter((v): v is OrderData => !!v && typeof v === "object")
    : rawData && typeof rawData === "object"
      ? [rawData as OrderData]
      : [];

  if (items.length === 0) {
    // `checkout_abandonment` tem forma própria e não contém pedido: nada a fazer.
    return json({ ok: true, event, handled: 0 });
  }

  let handled = 0;
  let skipped = 0;
  let unknownUser = 0;

  for (const data of items) {
    try {
      const userId = await resolveBillingUser({
        callback: pickCallback(data),
        email: pickEmail(data),
      });

      if (!userId) {
        unknownUser += 1;
        console.warn(`[cakto] evento ${event} sem usuário correspondente`);
        continue;
      }

      const result = await applyCaktoEvent(userId, event, data);
      if (result.applied) handled += 1;
      else skipped += 1;
    } catch (error) {
      console.error(`[cakto] falha ao processar ${event}:`, error);
      // Segue processando os demais itens; o evento pode ser reenviado no painel.
    }
  }

  return json({ ok: true, event, handled, skipped, unknownUser });
}

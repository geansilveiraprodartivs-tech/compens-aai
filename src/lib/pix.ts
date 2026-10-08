import { supabase } from "@/integrations/supabase/client";

export type DevicePlatform = "android" | "ios" | "other";

/** Pagamento PIX carregado do provedor. `pending` = nenhum provedor configurado ainda. */
export type PixPayment =
  | {
      status: "integrated";
      provider: string;
      qrCode: string;
      code: string;
      deepLink?: string;
    }
  | { status: "pending"; provider: null };

export function getPlatform(): DevicePlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (/Android/i.test(ua)) return "android";
  if (isIOS) return "ios";
  return "other";
}

export function platformHint(platform: DevicePlatform = getPlatform()): string {
  if (platform === "android")
    return "No Android, tentamos abrir o app do banco direto (se disponível). Se não abrir, use o QR Code ou o código PIX copia-e-cola.";
  if (platform === "ios")
    return "No iPhone, use o QR Code ou o código PIX copia-e-cola. Se o banco tiver link compatível, o app abre pelo botão “Abrir app do banco”.";
  return "Use o QR Code ou o código PIX copia-e-cola abaixo no app do seu banco.";
}

/**
 * Cria a cobrança PIX junto ao provedor de pagamento.
 *
 * ESTRUTURA PRONTA PARA INTEGRAÇÃO REAL. Para o pagamento funcionar de verdade, falta:
 *   1) Credenciais do provedor (ex.: Mercado Pago, Pagar.me, Cielo, etc.) em uma Edge Function
 *      (supabase/functions/pix/charge.ts), nunca no cliente.
 *   2) A Edge Function criar a cobrança via API e devolver o payload copia-e-cola (`code`),
 *      o QR Code (`qrCode`) e, se o banco fornecer, o deep link (`deepLink`).
 *   3) Um webhook autenticado (ex.: supabase/functions/pix/webhook.ts) que o provedor chama
 *      quando a cobrança é paga, atualizando `purchase_payments.status` de forma confiável.
 *
 * Enquanto isso, retornamos `pending` e a interface deixa explícito que o PIX é confirmado
 * manualmente (não é verificação bancária).
 */
export async function createPixPayment(): Promise<PixPayment> {
  // Exemplo do que ativar com o provedor conectado:
  // const { data: u } = await supabase.auth.getUser();
  // const { data } = await supabase.functions.invoke("pix/charge", {
  //   body: { user_id: u.data.user?.id },
  // });
  // if (data?.pix) {
  //   return {
  //     status: "integrated",
  //     provider: data.provider,
  //     qrCode: data.pix.qr_base64,
  //     code: data.pix.code,
  //     deepLink: data.pix.deep_link,
  //   };
  // }

  void supabase;
  return { status: "pending", provider: null };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = (document.execCommand as unknown as (c: string) => boolean)("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function toIntentUrl(url: string): string {
  try {
    const u = new URL(url);
    const scheme = u.protocol.replace(":", "");
    if (scheme === "http" || scheme === "https") return url;
    const rest = url.slice(scheme.length + 3);
    return `intent://${rest}#Intent;scheme=${scheme};end`;
  } catch {
    return url;
  }
}

/** Abre o app do banco por deep link (Android via intent, iOS via custom scheme / universal link). */
export function openBankDeepLink(url: string): boolean {
  try {
    const link = document.createElement("a");
    link.href = getPlatform() === "android" ? toIntentUrl(url) : url;
    link.rel = "noopener";
    link.target = "_self";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch {
    return false;
  }
}
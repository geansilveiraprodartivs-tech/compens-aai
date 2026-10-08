export type DevicePlatform = "android" | "ios" | "other";

export type BankApp = {
  id: string;
  name: string;
  url: string;
};

/**
 * Apps de banco compatíveis com PIX. URLs oficiais dos bancos (públicas e reais).
 * Ao abrir, o Android (App Links) e o iOS (Universal Links) encaminham direto para
 * o aplicativo quando instalado; caso contrário, abrem o site oficial do banco.
 *
 * LIMITAÇÃO TÉCNICA (honesta): o navegador não consegue listar os apps instalados
 * no aparelho nem leva sozinho à tela de PIX do banco. Isso só é possível com uma
 * cobrança PIX gerada por um provedor de pagamento (que fornece um deep link real
 * da transação). Enquanto não existir essa integração, o pagamento é feito pelo
 * usuário dentro do app do banco e a quitação é confirmada manualmente.
 */
export const BANK_APPS: BankApp[] = [
  { id: "nubank", name: "Nubank", url: "https://nubank.com.br" },
  { id: "inter", name: "Banco Inter", url: "https://www.bancointer.com.br" },
  { id: "picpay", name: "PicPay", url: "https://picpay.com.br" },
  { id: "caixa-tem", name: "Caixa Tem", url: "https://caixatem.caixa.gov.br" },
  { id: "itau", name: "Itaú", url: "https://www.itau.com.br" },
  { id: "bb", name: "Banco do Brasil", url: "https://www.bb.com.br" },
  { id: "bradesco", name: "Bradesco", url: "https://banco.bradesco" },
  { id: "santander", name: "Santander", url: "https://www.santander.com.br" },
  { id: "pagbank", name: "PagBank", url: "https://pagbank.com.br" },
  { id: "c6", name: "C6 Bank", url: "https://www.c6bank.com.br" },
  { id: "mercadopago", name: "Mercado Pago", url: "https://www.mercadopago.com.br" },
];

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
    return "No Android, o app do banco abre direto pelo link (App Links). Se não abrir, o app não está instalado — instale o app do seu banco e pague por lá.";
  if (platform === "ios")
    return "No iPhone, o app do banco abre pelo recurso de Universal Links do iOS. Se não abrir, o app não está instalado — instale o app do seu banco e pague por lá.";
  return "Abra o app do seu banco no celular e faça o pagamento PIX por lá.";
}

/** Abre o app do banco via deep link real (https App Links / Universal Links), em nova aba. */
export function openBankApp(bank: BankApp): boolean {
  try {
    const link = document.createElement("a");
    link.href = bank.url;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch {
    return false;
  }
}
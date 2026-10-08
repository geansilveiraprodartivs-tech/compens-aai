export type DevicePlatform = "android" | "ios" | "other";

export type PickerOutcome =
  | { opened: true; via?: string }
  | { opened: false; reason: "browser" | "no-valid-pix-destination" };

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

/**
 * Detecta se a aplicação está rodando dentro de um contêiner NATIVO
 * (ex.: Capacitor/Cordova), que expõe ponte para recursos do dispositivo.
 * O CompensAI hoje é um web app (Lovable), então retorna false no navegador.
 */
export function isNativeContainer(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    Capacitor?: { isNativePlatform?: boolean; Plugins?: unknown };
    plugins?: unknown;
    Android?: unknown;
    webkit?: { messageHandlers?: Record<string, unknown> };
  };
  if (w.Capacitor?.isNativePlatform ?? w.Capacitor) return true;
  if (w.plugins || w.Android || w.webkit?.messageHandlers) return true;
  return false;
}

/**
 * Tenta acionar o seletor NATIVO de aplicativos bancários compatíveis com PIX.
 *
 * LIMITAÇÃO TÉCNICA REAL (sem simulação):
 *  - Nenhum web app consegue abrir o seletor de apps do Android/iOS. Não existe API web
 *    (`navigator.*`, intent ou single tab) que liste ou abra os apps instalados. As únicas
 *    opções web são o compartilhamento genérico (proibido) e links com scheme inventado
 *    (proibido também).
 *  - O PIX não define uma ACTION + intent padrão que qualquer banco aceite. Cada banco
 *    usa integração própria, dependente de um PROVEDOR DE PAGAMENTO que forneça a
 *    cobrança (destino) válida. Sem esse destino, não há ação válida a acionar.
 *
 * Quando o CompensAI passar a rodar em contêiner nativo (Capacitor), este ponto receberia
 * a chamada ao plugin/ponte que revela o seletor do próprio dispositivo. Por hoje,
 * `isNativeContainer()` é false e o resultado é sempre `{ opened: false, reason: "browser" }`.
 */
export function openPixPicker(): PickerOutcome {
  if (isNativeContainer()) {
    return { opened: false, reason: "no-valid-pix-destination" };
  }
  return { opened: false, reason: "browser" };
}

export function platformHint(platform: DevicePlatform = getPlatform()): string {
  if (platform === "android")
    return "No Android, uma página web não consegue abrir o seletor nativo de apps de PIX — isso exige um app nativo (ex.: Capacitor) e um destino de cobrança de um provedor de pagamento.";
  if (platform === "ios")
    return "No iPhone, o Safari não expõe a websites um seletor de apps de PIX. Para abrir o app do banco nativamente, é preciso o app nativo (Universal Links) com destino de cobrança real.";
  return "No navegador de desktop, abra o app do seu banco no celular e faça o PIX por lá.";
}
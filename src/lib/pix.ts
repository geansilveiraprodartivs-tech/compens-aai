export type DevicePlatform = "android" | "ios" | "other";

export type PickerOutcome =
  | { opened: true; via?: string }
  | {
      opened: false;
      reason: "browser" | "no-valid-pix-destination" | "native-available";
    };

export interface InstalledBank {
  id: string;
  name: string;
  label: string;
  icon: string;
}

type BankAppsApi = {
  getInstalledBanks: () => Promise<{ banks: InstalledBank[] }>;
  getOtherBankApps: () => Promise<{ banks: InstalledBank[] }>;
  openBank: (opts: { id: string }) => Promise<{ opened: boolean; error?: string }>;
};

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
 * No app nativo (empacotado com Capacitor), o plugin local `BankApps` lista os apps
 * bancários instalados e abre o banco escolhido — aqui sinalizamos `native-available`
 * para o frontend exibir esse fluxo. No web, o resultado é sempre `{ opened: false, ... }`.
 */
export function openPixPicker(): PickerOutcome {
  if (isNativeContainer()) {
    return { opened: false, reason: "native-available" };
  }
  return { opened: false, reason: "browser" };
}

/**
 * Acesso ao plugin nativo `BankApps` (Capacitor). Só é carregado dinamicamente dentro
 * de um contêiner nativo — no navegador comum `@capacitor/core` nunca é importado o
 * the runtime, mantendo o web puro e honesto.
 */
/**
 * O plugin devolvido por `registerPlugin` é um Proxy que responde a QUALQUER
 * propriedade — inclusive `then`. Se esse proxy for devolvido diretamente de uma
 * função `async`, o motor JS o trata como "thenable" e chama `plugin.then(...)`,
 * que não existe no nativo (`"BankApps.then()" is not implemented on android`),
 * quebrando o fluxo. Por isso guardamos/devolvemos o plugin dentro de um objeto
 * simples (não-thenable).
 */
type BankAppsHandle = { api: BankAppsApi };

let bankAppsCache: BankAppsHandle | null | undefined;

async function loadBankApps(): Promise<BankAppsHandle | null> {
  if (!isNativeContainer()) return null;
  if (bankAppsCache !== undefined) return bankAppsCache;
  try {
    const core = await import("@capacitor/core");
    bankAppsCache = { api: core.registerPlugin<BankAppsApi>("BankApps") };
  } catch {
    bankAppsCache = null;
  }
  return bankAppsCache;
}

/** Lista apps bancários instalados no dispositivo (só em contêiner nativo). */
export async function getInstalledBanks(): Promise<InstalledBank[]> {
  const handle = await loadBankApps();
  if (!handle) return [];
  try {
    const res = await handle.api.getInstalledBanks();
    return Array.isArray(res?.banks) ? res.banks : [];
  } catch {
    return [];
  }
}

/**
 * Lista OUTROS bancos/carteiras digitais instalados (fora da lista de bancos
 * "cadastrados" exibidos como botões fixos). Alimenta a opção
 * "Escolher outro app bancário". Só retorna apps realmente instalados.
 */
export async function getOtherBankApps(): Promise<InstalledBank[]> {
  const handle = await loadBankApps();
  if (!handle) return [];
  try {
    const res = await handle.api.getOtherBankApps();
    return Array.isArray(res?.banks) ? res.banks : [];
  } catch {
    return [];
  }
}

/** Abre o app do banco escolhido (só em contêiner nativo; web retorna não-nativo). */
export async function openInstalledBank(id: string): Promise<{ opened: boolean; error?: string }> {
  const handle = await loadBankApps();
  if (!handle) return { opened: false, error: "not-native" };
  try {
    return await handle.api.openBank({ id });
  } catch (err) {
    return {
      opened: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function platformHint(platform: DevicePlatform = getPlatform()): string {
  if (platform === "android")
    return "No Android, uma página web não consegue abrir o seletor nativo de apps de PIX — isso exige um app nativo (ex.: Capacitor) e um destino de cobrança de um provedor de pagamento.";
  if (platform === "ios")
    return "No iPhone, o Safari não expõe a websites um seletor de apps de PIX. Para abrir o app do banco nativamente, é preciso o app nativo (Universal Links) com destino de cobrança real.";
  return "No navegador de desktop, abra o app do seu banco no celular e faça o PIX por lá.";
}

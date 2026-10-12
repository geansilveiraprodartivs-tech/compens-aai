export type DevicePlatform = "android" | "ios" | "other";

export type PickerOutcome =
  | { opened: true; via?: string }
  | {
      opened: false;
      reason: "browser" | "no-valid-pix-destination" | "native-available";
    };

/**
 * Lista INTERNA de bancos e carteiras compatíveis.
 *
 * Os nomes, ícones (arquivos locais em `/banks`) e o mecanismo de abertura
 * (`androidPackage` / `iosScheme`) são predefinidos no código — o app NÃO
 * descobre, consulta nem lista os aplicativos instalados no aparelho.
 */
export type BankApp = {
  id: string;
  name: string;
  icon: string;
  /** Pacote Android usado para abrir o app da instituição. */
  androidPackage: string;
  /** URL scheme oficial do app no iOS, quando conhecido. */
  iosScheme?: string;
};

export const BANK_APPS: BankApp[] = [
  {
    id: "nubank",
    name: "Nubank",
    icon: "/banks/nubank.png",
    androidPackage: "com.nu.production",
    iosScheme: "nubank://",
  },
  {
    id: "caixa",
    name: "CAIXA",
    icon: "/banks/caixa.png",
    androidPackage: "br.com.gabba.Caixa",
  },
  {
    id: "caixa-tem",
    name: "CAIXA Tem",
    icon: "/banks/caixa-tem.png",
    androidPackage: "br.gov.caixa.tem",
  },
  {
    id: "bb",
    name: "Banco do Brasil",
    icon: "/banks/bb.png",
    androidPackage: "br.com.bb.android",
  },
  {
    id: "bradesco",
    name: "Bradesco",
    icon: "/banks/bradesco.png",
    androidPackage: "com.bradesco",
  },
  {
    id: "itau",
    name: "Itaú",
    icon: "/banks/itau.png",
    androidPackage: "com.itau",
  },
  {
    id: "santander",
    name: "Santander",
    icon: "/banks/santander.png",
    androidPackage: "com.santander.app",
  },
  {
    id: "inter",
    name: "Inter",
    icon: "/banks/inter.png",
    androidPackage: "br.com.intermedium",
  },
  {
    id: "c6",
    name: "C6 Bank",
    icon: "/banks/c6.png",
    androidPackage: "com.c6bank.app",
  },
  {
    id: "pan",
    name: "Banco PAN",
    icon: "/banks/pan.png",
    androidPackage: "br.com.bancopan.cartoes",
  },
  {
    id: "picpay",
    name: "PicPay",
    icon: "/banks/picpay.png",
    androidPackage: "com.picpay",
  },
  {
    id: "mercadopago",
    name: "Mercado Pago",
    icon: "/banks/mercadopago.png",
    androidPackage: "com.mercadopago.wallet",
  },
  {
    id: "pagbank",
    name: "PagBank",
    icon: "/banks/pagbank.png",
    androidPackage: "br.com.uol.ps.myaccount",
  },
  {
    id: "google-wallet",
    name: "Carteira do Google",
    icon: "/banks/google-wallet.png",
    androidPackage: "com.google.android.apps.walletnfcrel",
  },
  {
    id: "samsung-wallet",
    name: "Samsung Wallet",
    icon: "/banks/samsung-wallet.png",
    androidPackage: "com.samsung.android.spay",
  },
];

export type OpenBankResult = { opened: boolean; reason?: string };

/** Classificação de um app descoberto no aparelho. */
export type DeviceAppCategory = "bank" | "wallet" | "other";

/**
 * Aplicativo INSTALADO descoberto no aparelho (descoberta real via PackageManager no
 * Android). No iOS a enumeração não existe — `listDeviceApps` informa `supported:false`.
 */
export type DeviceApp = {
  package: string;
  name: string;
  category: DeviceAppCategory;
  financial: boolean;
  icon?: string;
};

export type DeviceAppsResult = { supported: boolean; apps: DeviceApp[] };

/** Forma bruta devolvida pelo plugin nativo `BankApps`. */
export type RawDeviceApp = {
  package?: string;
  name?: string;
  label?: string;
  category?: string;
  financial?: boolean;
  icon?: string;
};

type BankAppsApi = {
  openConfiguredBank: (options: {
    androidPackage?: string;
    iosScheme?: string;
  }) => Promise<OpenBankResult>;
  listApps: () => Promise<{ apps?: RawDeviceApp[]; supported?: boolean }>;
  openApp: (options: { package: string }) => Promise<OpenBankResult>;
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
 * Indica que o pagamento é concluído no app do banco escolhido pelo usuário.
 * No web puro (desktop/Safari/Chrome) não há como abrir outro app, então o
 * resultado é sempre `{ opened: false, ... }`.
 */
export function openPixPicker(): PickerOutcome {
  if (isNativeContainer()) {
    return { opened: false, reason: "native-available" };
  }
  return { opened: false, reason: "browser" };
}

/**
 * Acesso ao plugin nativo `BankApps` (Capacitor). Só é carregado dinamicamente dentro
 * de um contêiner nativo — no navegador comum `@capacitor/core` nunca é importado em
 * runtime, mantendo o web puro.
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

/**
 * Abre o app da instituição escolhida usando SOMENTE o mecanismo oficial
 * predefinido (pacote Android / scheme iOS). Não descobre apps instalados e não
 * abre nada antes do usuário escolher.
 */
export async function openBankApp(bank: BankApp): Promise<OpenBankResult> {
  const handle = await loadBankApps();
  if (!handle) return { opened: false, reason: "not-native" };

  const platform = getPlatform();
  if (platform === "ios" && !bank.iosScheme) {
    return { opened: false, reason: "not_configured" };
  }

  try {
    return await handle.api.openConfiguredBank({
      androidPackage: bank.androidPackage,
      ...(bank.iosScheme ? { iosScheme: bank.iosScheme } : {}),
    });
  } catch (err) {
    return {
      opened: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * DESCOBERTA REAL: lista os aplicativos INSTALADOS no aparelho (Android nativo),
 * identificados pelo próprio sistema — nome, ícone e classificação banco/carteira.
 * Não é lista fixa: inclui qualquer app compatível com abertura por launcher.
 * No navegador/iOS retorna `{ supported:false, apps: [] }` (limitação da plataforma).
 */
export function normalizeDeviceApps(raw: RawDeviceApp[] | undefined): DeviceApp[] {
  const apps: DeviceApp[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const pkg = typeof r.package === "string" ? r.package : "";
    if (!pkg) continue;
    const category: DeviceAppCategory =
      r.category === "bank" || r.category === "wallet" || r.category === "other"
        ? r.category
        : "other";
    const name = (r.name || r.label || pkg).trim() || pkg;
    const app: DeviceApp = {
      package: pkg,
      name,
      category,
      financial: r.financial === true || category !== "other",
    };
    if (typeof r.icon === "string" && r.icon) app.icon = r.icon;
    apps.push(app);
  }
  apps.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return apps;
}

export async function listDeviceApps(): Promise<DeviceAppsResult> {
  const handle = await loadBankApps();
  if (!handle) return { supported: false, apps: [] };
  try {
    const res = await handle.api.listApps();
    return { supported: res?.supported !== false, apps: normalizeDeviceApps(res?.apps) };
  } catch {
    return { supported: true, apps: [] };
  }
}

/** Abre um app descoberto no aparelho pelo pacote (Android nativo). */
export async function openDeviceApp(packageName: string): Promise<OpenBankResult> {
  const handle = await loadBankApps();
  if (!handle) return { opened: false, reason: "not-native" };
  try {
    return await handle.api.openApp({ package: packageName });
  } catch (err) {
    return {
      opened: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Preferências do usuário: banco padrão e carteira digital (independentes). */
export type BankPrefs = { bank: DeviceApp | null; wallet: DeviceApp | null };

const PREFS_PREFIX = "compensai.bankPrefs.v1";

function isDeviceApp(value: unknown): value is DeviceApp {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return typeof o["package"] === "string" && typeof o["name"] === "string";
}

export function emptyBankPrefs(): BankPrefs {
  return { bank: null, wallet: null };
}

/** Carrega as escolhas do usuário (persistidas no aparelho, por usuário). */
export function loadBankPrefs(uid: string): BankPrefs {
  if (!uid) return emptyBankPrefs();
  try {
    const raw = localStorage.getItem(`${PREFS_PREFIX}.${uid}`);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return emptyBankPrefs();
    const o = parsed as Record<string, unknown>;
    const bank = o["bank"];
    const wallet = o["wallet"];
    return {
      bank: isDeviceApp(bank) ? bank : null,
      wallet: isDeviceApp(wallet) ? wallet : null,
    };
  } catch {
    return emptyBankPrefs();
  }
}

export function saveBankPrefs(uid: string, prefs: BankPrefs): void {
  if (!uid) return;
  try {
    localStorage.setItem(`${PREFS_PREFIX}.${uid}`, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function platformHint(platform: DevicePlatform = getPlatform()): string {
  if (platform === "android")
    return "O CompensAI precisa estar instalado como aplicativo no celular para abrir o app do seu banco diretamente.";
  if (platform === "ios")
    return "Para abrir o app do banco diretamente, use o CompensAI instalado no iPhone.";
  return "No navegador de desktop, abra o app do seu banco no celular e faça o PIX por lá.";
}

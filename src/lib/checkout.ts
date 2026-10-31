import { Capacitor, registerPlugin } from "@capacitor/core";

type BankAppsApi = {
  openUrl(options: { url: string }): Promise<{ opened: boolean; reason?: string }>;
};

// Mesmo plugin nativo usado em `nativeAuth`/`pix` (abre o link no navegador do
// aparelho). Mantido em objeto simples porque o proxy do registerPlugin é
// "thenable" e quebra quando devolvido por uma função async.
const BankApps = registerPlugin<BankAppsApi>("BankApps");

/**
 * Abre o checkout da Cakto fora do app:
 *  - APK: navegador do sistema (@capacitor/browser, com fallback no plugin nativo);
 *  - web: nova aba, sem `window.opener`.
 */
export async function openCheckout(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "fullscreen" });
      return;
    } catch {
      // plugin ausente neste build — tenta o abridor nativo
    }
    try {
      const res = await BankApps.openUrl({ url });
      if (res?.opened) return;
    } catch {
      // segue para o fallback
    }
    window.location.href = url;
    return;
  }

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

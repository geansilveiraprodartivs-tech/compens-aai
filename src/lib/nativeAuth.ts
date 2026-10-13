import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

// Deep link the native app listens for (see AndroidManifest.xml intent-filter).
export const NATIVE_OAUTH_SCHEME = "br.com.compensai";
export const NATIVE_OAUTH_REDIRECT = `${NATIVE_OAUTH_SCHEME}://oauth-callback`;

// Static page on the app's own origin that forwards the broker session to the
// deep link. Required because the Lovable OAuth broker (the only provider with
// Google credentials for this Lovable Cloud project) only allows https redirect
// URIs on the project origin — never a custom scheme.
function oauthCallbackPageUrl(): string {
  return `${window.location.origin}/oauth-callback.html`;
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function isNativeOAuthCallback(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith(`${NATIVE_OAUTH_SCHEME}://`);
}

type BankAppsApi = {
  openUrl(options: { url: string }): Promise<{ opened: boolean; reason?: string }>;
};

// Handle to the custom native plugin. Kept in a plain object because the
// `registerPlugin` proxy is "thenable": returning it directly from an async fn
// makes the JS engine call `.then()` (see the note in pix.ts).
const BankApps = registerPlugin<BankAppsApi>("BankApps");

/**
 * Opens a URL using Android's own external-link mechanism (ACTION_VIEW via the
 * native plugin). Used when the Capacitor Browser plugin is not present in the
 * installed build, so the OAuth step still works instead of failing with
 * "Browser plugin is not implemented on Android".
 */
async function openExternalUrl(url: string): Promise<boolean> {
  try {
    const res = await BankApps.openUrl({ url });
    return res?.opened === true;
  } catch {
    return false;
  }
}

export async function openNativeGoogleSignIn(): Promise<void> {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const params = new URLSearchParams({
    provider: "google",
    redirect_uri: oauthCallbackPageUrl(),
    state,
  });
  // Same-origin broker entry: it injects the project id and redirects to the
  // Lovable OAuth broker, which owns the Google credentials.
  const url = `${window.location.origin}/~oauth/initiate?${params.toString()}`;

  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, presentationStyle: "fullscreen" });
    return;
  } catch {
    // Browser plugin not available in this build — fall through to the native opener.
  }

  const opened = await openExternalUrl(url);
  if (!opened) {
    throw new Error("Não foi possível abrir o navegador para o login com o Google.");
  }
}

export async function closeNativeOAuthBrowser(): Promise<void> {
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
  } catch {
    // browser already closed — ignore
  }
}

function toParsableUrl(rawUrl: string): URL {
  return new URL(rawUrl.replace(`${NATIVE_OAUTH_SCHEME}://`, "https://native-compensai.local/"));
}

export async function completeNativeGoogleSignIn(rawUrl: string): Promise<void> {
  const url = toParsableUrl(rawUrl);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const read = (key: string): string | null => url.searchParams.get(key) ?? hash.get(key);

  const errorDescription = read("error_description") ?? read("error");
  if (errorDescription) throw new Error(decodeURIComponent(errorDescription));

  const accessToken = read("access_token");
  const refreshToken = read("refresh_token");
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return;
  }

  const code = read("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  throw new Error("Resposta de login incompleta.");
}

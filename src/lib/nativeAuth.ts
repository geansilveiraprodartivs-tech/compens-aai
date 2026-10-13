import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export const NATIVE_OAUTH_SCHEME = "br.com.compensai";
export const NATIVE_OAUTH_HOST = "oauth-callback";
export const NATIVE_OAUTH_REDIRECT = `${NATIVE_OAUTH_SCHEME}://${NATIVE_OAUTH_HOST}`;

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function isNativeOAuthCallback(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith(`${NATIVE_OAUTH_SCHEME}://`);
}

export async function openNativeGoogleSignIn(): Promise<void> {
  const { Browser } = await import("@capacitor/browser");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: NATIVE_OAUTH_REDIRECT,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Não foi possível iniciar o login com o Google.");
  await Browser.open({ url: data.url, presentationStyle: "fullscreen" });
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

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { lovable } from "@/integrations/lovable";
import {
  closeNativeOAuthBrowser,
  completeNativeGoogleSignIn,
  isNativeOAuthCallback,
  isNativePlatform,
  openNativeGoogleSignIn,
} from "@/lib/nativeAuth";
import { Button } from "@/components/ui/button";

/**
 * Cadastro/entrada com Google usando a integração que o projeto já tem:
 *
 * - Web: broker OAuth do Lovable (`lovable.auth.signInWithOAuth("google")`),
 *   o mesmo usado em `src/integrations/lovable/index.ts`. O Google cria a
 *   conta quando ela não existe.
 * - App (Capacitor): `openNativeGoogleSignIn()` + deep link, exatamente como a
 *   tela `/auth` já faz.
 *
 * Ao voltar com sessão, cai em `/app` (o trial de 48h é iniciado pelo servidor
 * na primeira leitura do entitlement).
 */
export function GoogleSignUpButton({
  label,
  className,
  disabled = false,
}: {
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  const navigate = useNavigate();
  const [isNative, setIsNative] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsNative(isNativePlatform());
  }, []);

  // No app nativo a sessão volta por deep link; o listener vive aqui para a
  // landing funcionar sozinha (a tela /auth tem o próprio listener).
  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    let removeListener: (() => void) | undefined;
    const handled = new Set<string>();

    const handleCallback = async (url: string) => {
      if (!isNativeOAuthCallback(url) || handled.has(url)) return;
      handled.add(url);
      setLoading(true);
      await closeNativeOAuthBrowser();
      try {
        await completeNativeGoogleSignIn(url);
        navigate({ to: "/app", replace: true });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Não foi possível concluir o cadastro com o Google.",
        );
        setLoading(false);
      }
    };

    import("@capacitor/app").then(async ({ App }) => {
      if (cancelled) return;
      const listener = await App.addListener("appUrlOpen", ({ url }) => {
        void handleCallback(url);
      });
      removeListener = () => void listener.remove();
      const launch = await App.getLaunchUrl();
      if (launch?.url) void handleCallback(launch.url);
    });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [isNative, navigate]);

  async function start() {
    setLoading(true);
    try {
      if (isNative) {
        await openNativeGoogleSignIn();
        return;
      }
      const options = typeof window === "undefined" ? {} : { redirect_uri: window.location.origin };
      const result = await lovable.auth.signInWithOAuth("google", options);
      // Redirecionando para o Google: a página sai daqui e volta com sessão.
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/app", replace: true });
    } catch (err) {
      console.error("[CompensAI] falha no cadastro com Google:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Não foi possível continuar com o Google agora. Tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={start}
      disabled={disabled || loading}
      className={`gap-2 border-border bg-card/80 font-bold hover:bg-secondary ${className ?? ""}`.trim()}
    >
      <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
        />
      </svg>
      {loading ? "Abrindo o Google…" : label}
    </Button>
  );
}

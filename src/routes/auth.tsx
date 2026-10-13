import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  closeNativeOAuthBrowser,
  completeNativeGoogleSignIn,
  isNativeOAuthCallback,
  isNativePlatform,
  openNativeGoogleSignIn,
} from "@/lib/nativeAuth";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — CompensAI" },
      {
        name: "description",
        content: "Acesse sua conta CompensAI e descubra onde compensa comprar perto de você.",
      },
      { property: "og:title", content: "Entrar — CompensAI" },
      {
        property: "og:description",
        content: "Acesse sua conta CompensAI e descubra onde compensa comprar.",
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "reset";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(isNativePlatform());
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

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
        toast.error(err instanceof Error ? err.message : "Não foi possível entrar com o Google");
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Enviamos um e-mail para redefinir sua senha.");
        setMode("signin");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/app", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível continuar");
    } finally {
      setLoading(false);
    }
  }

  async function signInGoogle() {
    setLoading(true);
    try {
      await openNativeGoogleSignIn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar com o Google");
    } finally {
      setLoading(false);
    }
  }

  const title = mode === "reset" ? "Recuperar senha" : "Entrar";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <Brand size={56} />
      <div className="glass glow mt-8 w-full max-w-sm p-6">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Onde compensa comprar? Descubra em segundos.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
            />
          </div>
          {mode !== "reset" && (
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
          )}
          <Button type="submit" disabled={loading} className="w-full gradient-brand glow">
            {loading ? "Aguarde..." : mode === "reset" ? "Enviar link" : "Entrar"}
          </Button>
        </form>

        {mode === "signin" && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              ou
              <span className="h-px flex-1 bg-border" />
            </div>
            {isNative ? (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                disabled={loading}
                onClick={signInGoogle}
              >
                <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
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
                Criar login com o Google
              </Button>
            ) : (
              <a
                href={`https://wa.me/5551985839571?text=${encodeURIComponent("Entre em contato para gerar seu login!")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-3 rounded-xl bg-[#25D366] px-4 py-3 font-semibold text-white shadow-[0_10px_30px_-8px_rgba(37,211,102,0.55)] transition hover:bg-[#1fbe5b] active:scale-[0.98]"
              >
                <svg
                  className="h-6 w-6 shrink-0"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
                <span className="text-left text-sm leading-snug">
                  Entre em contato pelo WhatsApp para gerar seu login!
                </span>
              </a>
            )}
          </>
        )}

        {mode === "reset" ? (
          <div className="mt-4 text-center text-xs text-muted-foreground">
            <button type="button" onClick={() => setMode("signin")}>
              Voltar ao login
            </button>
          </div>
        ) : (
          <div className="mt-4 flex justify-end text-xs text-muted-foreground">
            <button type="button" onClick={() => setMode("reset")}>
              Esqueci a senha
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

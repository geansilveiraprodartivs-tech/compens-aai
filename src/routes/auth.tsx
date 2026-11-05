import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  closeNativeOAuthBrowser,
  completeNativeGoogleSignIn,
  isNativeOAuthCallback,
  isNativePlatform,
  openNativeGoogleSignIn,
} from "@/lib/nativeAuth";
import { checkSignupEligibility, getEntitlement } from "@/lib/subscription.functions";
import {
  SIGNUP_ALREADY_EXISTS_MESSAGE,
  TRIAL_OFFER_HOURS,
  authModeFromSearch,
  type AuthMode,
  type AuthSearch,
} from "@/lib/trialOffer";
import { Eye, EyeOff } from "lucide-react";
import { Brand } from "@/components/Brand";
import { GoogleSignUpButton } from "@/components/GoogleSignUpButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => {
    const mode = authModeFromSearch(search);
    return mode === "signup" ? { modo: "cadastro" } : {};
  },
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

type Mode = AuthMode;

function friendlyAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (/signups?\s+not\s+allowed|signup_disabled|signups?\s+are\s+disabled/i.test(message)) {
    return "O cadastro está desativado neste momento. Fale com o suporte pelo WhatsApp para criar sua conta.";
  }
  return message || "Não foi possível continuar";
}

function AuthPage() {
  const navigate = useNavigate();
  const { modo } = Route.useSearch();
  const [mode, setMode] = useState<Mode>(authModeFromSearch({ modo }));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const checkSignup = useServerFn(checkSignupEligibility);
  const startTrial = useServerFn(getEntitlement);

  // O link de cadastro (`/auth?modo=cadastro`) abre direto no cadastro.
  useEffect(() => {
    setMode(authModeFromSearch({ modo }));
  }, [modo]);

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
        toast.error(friendlyAuthError(err));
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
      if (mode === "signup") {
        const targetEmail = email.trim();

        // Uma caixa de e-mail (mesmo com apelido +tag ou pontos do Gmail) tem
        // direito a um único teste: se já existe conta, manda entrar.
        try {
          const check = await checkSignup({ data: { email: targetEmail } });
          if (check.existing_account) {
            toast.error(SIGNUP_ALREADY_EXISTS_MESSAGE);
            setMode("signin");
            return;
          }
        } catch (guardError) {
          // Verificação indisponível não pode impedir o cadastro.
          console.warn("[CompensAI] verificação de cadastro indisponível:", guardError);
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/app` },
        });
        if (error) throw error;
        if (data.session) {
          // As 48 horas começam a contar agora, no relógio do servidor.
          try {
            await startTrial();
          } catch (trialError) {
            // Se falhar, o trial inicia na primeira abertura do app.
            console.warn("[CompensAI] não foi possível marcar o início do teste:", trialError);
          }
          navigate({ to: "/app", replace: true });
          return;
        }
        toast.success("Conta criada! Confirme o cadastro pelo link enviado no seu e-mail.");
        setMode("signin");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/app", replace: true });
    } catch (err) {
      toast.error(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function signInGoogle() {
    setLoading(true);
    try {
      await openNativeGoogleSignIn();
    } catch (err) {
      toast.error(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  const title = mode === "reset" ? "Recuperar senha" : mode === "signup" ? "Criar conta" : "Entrar";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <Brand size={56} />
      <div className="glass glow mt-8 w-full max-w-sm p-6">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signup"
            ? `Teste grátis de ${TRIAL_OFFER_HOURS} horas com todas as funcionalidades.`
            : "Onde compensa comprar? Descubra em segundos."}
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
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={showPassword}
                  className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          )}
          <Button type="submit" disabled={loading} className="w-full gradient-brand glow">
            {loading
              ? "Aguarde..."
              : mode === "reset"
                ? "Enviar link"
                : mode === "signup"
                  ? "Criar conta"
                  : "Entrar"}
          </Button>
        </form>

        {mode !== "reset" && (
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
              <GoogleSignUpButton
                label={mode === "signup" ? "Criar conta com o Google" : "Entrar com o Google"}
                className="w-full"
                disabled={loading}
              />
            )}
          </>
        )}

        {mode === "reset" ? (
          <div className="mt-4 text-center text-xs text-muted-foreground">
            <button type="button" onClick={() => setMode("signin")}>
              Voltar ao login
            </button>
          </div>
        ) : mode === "signup" ? (
          <div className="mt-4 text-center text-xs text-muted-foreground">
            Já tem conta?{" "}
            <button
              type="button"
              className="font-medium text-foreground"
              onClick={() => setMode("signin")}
            >
              Entrar
            </button>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <button
              type="button"
              className="font-medium text-foreground"
              onClick={() => setMode("signup")}
            >
              Criar conta
            </button>
            <button type="button" onClick={() => setMode("reset")}>
              Esqueci a senha
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
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

type Mode = "signin" | "signup" | "reset";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

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
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/app` },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Conta criada!");
          navigate({ to: "/app", replace: true });
        } else {
          toast.success("Conta criada! Confirme seu e-mail para entrar.");
          setMode("signin");
        }
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

  const title = mode === "reset" ? "Recuperar senha" : mode === "signup" ? "Criar conta" : "Entrar";

  async function signInGoogle() {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/app`,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/app", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar com o Google");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <Brand size={56} />
      <div className="glass glow mt-8 w-full max-w-sm p-6">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signup"
            ? "Crie sua conta grátis para começar."
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
              Entrar com o Google
            </Button>
          </>
        )}

        {mode === "reset" ? (
          <div className="mt-4 text-center text-xs text-muted-foreground">
            <button type="button" onClick={() => setMode("signin")}>
              Voltar ao login
            </button>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <button
              type="button"
              className="font-semibold text-primary"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            >
              {mode === "signup" ? "Já tenho conta" : "Criar conta"}
            </button>
            {mode === "signin" && (
              <button type="button" onClick={() => setMode("reset")}>
                Esqueci a senha
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

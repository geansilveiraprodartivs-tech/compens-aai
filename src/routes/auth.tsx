import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/app", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível continuar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <Brand size={56} />
      <div className="glass glow mt-8 w-full max-w-sm p-6">
        <h1 className="text-xl font-bold">
          {mode === "signup" ? "Criar conta" : mode === "reset" ? "Recuperar senha" : "Entrar"}
        </h1>
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
            {loading
              ? "Aguarde..."
              : mode === "signup"
                ? "Criar conta"
                : mode === "reset"
                  ? "Enviar link"
                  : "Entrar"}
          </Button>
        </form>

        <Button asChild variant="outline" className="mt-3 w-full">
          <a
            href={`https://wa.me/5551985839571?text=${encodeURIComponent("Entre em contato para gerar seu login!")}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Entre em contato pelo WhatsApp para gerar seu login
          </a>
        </Button>

        <div className="mt-4 flex justify-end text-xs text-muted-foreground">
          <button type="button" onClick={() => setMode(mode === "reset" ? "signin" : "reset")}>
            {mode === "reset" ? "Voltar ao login" : "Esqueci a senha"}
          </button>
        </div>
      </div>
    </div>
  );
}

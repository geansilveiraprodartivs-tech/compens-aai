import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova senha — CompensAI" },
      { name: "description", content: "Defina uma nova senha para sua conta CompensAI." },
      { property: "og:title", content: "Nova senha — CompensAI" },
      { property: "og:description", content: "Defina uma nova senha para sua conta CompensAI." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Senha atualizada!");
    navigate({ to: "/app", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5">
      <Brand size={56} />
      <form onSubmit={submit} className="glass glow mt-8 w-full max-w-sm space-y-4 p-6">
        <h1 className="text-xl font-bold">Nova senha</h1>
        <div className="space-y-1.5">
          <Label htmlFor="pw">Senha</Label>
          <Input
            id="pw"
            type="password"
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button disabled={loading} className="w-full gradient-brand glow">
          Salvar
        </Button>
      </form>
    </div>
  );
}

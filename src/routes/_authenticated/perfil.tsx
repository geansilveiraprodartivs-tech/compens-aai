import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LogOut, User, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LocationSetup } from "@/components/LocationSetup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil — CompensAI" },
      { name: "description", content: "Ajuste sua localização, orçamento e conta no CompensAI." },
      { property: "og:title", content: "Perfil — CompensAI" },
      {
        property: "og:description",
        content: "Ajuste sua localização, orçamento e conta no CompensAI.",
      },
    ],
  }),
  component: PerfilPage,
});

function PerfilPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const [budget, setBudget] = useState("");
  const [editLocation, setEditLocation] = useState(false);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function saveBudget() {
    await update.mutateAsync({ budget: Number(budget.replace(",", ".")) || null });
    toast.success("Orçamento salvo!");
    setBudget("");
  }

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <User className="size-5 text-accent" /> Perfil
      </h1>

      <AvatarEditor path={profile?.avatar_url ?? null} userId={profile?.id} onSaved={(p) => update.mutateAsync({ avatar_url: p })} />


      <section className="glass p-4">
        <p className="text-xs text-muted-foreground">📍 Minha localização</p>
        <p className="font-semibold">{profile?.location_label ?? "Não definida"}</p>
        <Button variant="outline" className="mt-3 w-full" onClick={() => setEditLocation((v) => !v)}>
          {editLocation ? "Cancelar" : "Alterar localização"}
        </Button>
      </section>

      {editLocation && <LocationSetup onDone={() => setEditLocation(false)} />}

      <section className="glass space-y-3 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Wallet className="size-4 text-accent" /> Orçamento da compra
        </p>
        <p className="text-xs text-muted-foreground">
          Atual: {profile?.budget ? `R$ ${profile.budget}` : "não definido"}
        </p>
        <Label htmlFor="budget" className="sr-only">
          Orçamento
        </Label>
        <Input
          id="budget"
          inputMode="decimal"
          placeholder="Ex.: 300,00"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
        <Button onClick={saveBudget} className="w-full gradient-brand">
          Salvar orçamento
        </Button>
      </section>

      <Button variant="ghost" onClick={signOut} className="w-full text-muted-foreground">
        <LogOut className="mr-2 size-4" /> Sair
      </Button>
    </div>
  );
}

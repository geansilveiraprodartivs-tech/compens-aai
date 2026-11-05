import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LogOut, User, Wallet, Crown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LocationSetup } from "@/components/LocationSetup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { AvatarEditor } from "@/components/AvatarEditor";
import { MobileVerification } from '@/components/MobileVerification';
import { PremiumCard, PremiumChip } from "@/components/PremiumBadge";
import { PlanChoices } from "@/components/SubscriptionGate";
import { useEntitlement } from "@/hooks/useEntitlement";
import { describeEntitlement, planSummary, type PlanSummary } from "@/lib/entitlement";

const TONE_CLASS: Record<PlanSummary["tone"], string> = {
  free: "bg-primary/15 text-primary",
  paid: "bg-success/15 text-success",
  blocked: "bg-destructive/15 text-destructive",
  pending: "bg-secondary text-muted-foreground",
  premium:
    "bg-gradient-to-r from-amber-200 to-amber-400 text-amber-950 shadow-[0_6px_16px_-8px_rgba(245,190,80,0.9)]",
};

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil — CompensAI" },
      { name: "description", content: "Ajuste sua localização, orçamento e conta no CompensAI." },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
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
  const { data: entitlement } = useEntitlement();
  const summary = entitlement ? planSummary(entitlement) : null;
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
        {entitlement?.admin && <PremiumChip />}
      </h1>

      {entitlement?.admin && <PremiumCard />}
      <MobileVerification />

      <AvatarEditor
        path={profile?.avatar_url ?? null}
        userId={profile?.id}
        displayName={profile?.display_name}
        onSaved={(p) => update.mutateAsync({ avatar_url: p })}
      />

      <section className="glass p-4">
        <p className="text-xs text-muted-foreground">📍 Minha localização</p>
        <p className="font-semibold">{profile?.location_label ?? "Não definida"}</p>
        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={() => setEditLocation((v) => !v)}
        >
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

      <section className="glass space-y-3 p-4">
        <div className="flex items-start gap-2">
          <Crown className="mt-0.5 size-4 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Meu plano</p>
            <p className="text-xs text-muted-foreground">
              {entitlement ? describeEntitlement(entitlement) : "Carregando..."}
            </p>
          </div>
          {summary && (
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[9.5px] font-extrabold uppercase leading-none tracking-wide ${
                TONE_CLASS[summary.tone] ?? TONE_CLASS["blocked"]
              }`}
            >
              {summary.accessLabel}
            </span>
          )}
        </div>

        {summary && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-border/70 bg-secondary/30 p-3 text-xs">
            <div className="min-w-0">
              <dt className="text-muted-foreground">Plano</dt>
              <dd className="truncate font-semibold">{summary.planName}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Situação</dt>
              <dd className="truncate font-semibold">{summary.statusLabel}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Validade</dt>
              <dd className="truncate font-semibold">{summary.validityLabel}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Tipo de acesso</dt>
              <dd className="truncate font-semibold">{summary.accessLabel}</dd>
            </div>
          </dl>
        )}

        {entitlement?.admin ? (
          <p className="rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-[12px] leading-snug text-amber-100">
            Conta administradora: o acesso premium é vitalício e não precisa de assinatura.
          </p>
        ) : (
          <PlanChoices />
        )}
      </section>

      <Button variant="ghost" onClick={signOut} className="w-full text-muted-foreground">
        <LogOut className="mr-2 size-4" /> Sair
      </Button>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEntitlement, useRefreshEntitlement, useSubscribe } from "@/hooks/useEntitlement";
import {
  ANNUAL_MONTHLY_EQUIVALENT_CENTS,
  ANNUAL_SAVINGS_CENTS,
  GATE_SUBTITLE,
  GATE_TITLE,
  PLANS,
  describeEntitlement,
  formatBRL,
  formatRemaining,
  type PlanId,
} from "@/lib/entitlement";

/**
 * Os dois planos, sempre visíveis. O anual aparece primeiro e com destaque,
 * mas os dois botões têm o mesmo peso de acesso (mesma altura, largura total).
 */
export function PlanChoices() {
  const subscribe = useSubscribe();
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);

  function choose(plan: PlanId) {
    setLoadingPlan(plan);
    subscribe.mutate(plan, {
      onError: (error) => {
        console.error("[CompensAI] falha ao abrir checkout:", error);
        toast.error("Não foi possível abrir o pagamento agora. Tente novamente.");
      },
      onSettled: () => setLoadingPlan(null),
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:items-stretch">
      <section className="relative flex flex-col overflow-hidden rounded-2xl border border-primary/55 bg-gradient-to-b from-primary/15 via-primary/5 to-transparent p-4 pt-5 shadow-[0_18px_50px_-30px_rgba(0,0,0,0.9)]">
        <span className="absolute right-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[9px] font-extrabold uppercase leading-none tracking-wider text-primary-foreground shadow-sm">
          Melhor custo-benefício
        </span>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
          Plano anual
        </p>
        <h3 className="mt-1 font-display text-base font-bold">{PLANS.annual.name}</h3>
        <p className="mt-2 flex items-baseline gap-1">
          <span className="text-2xl font-extrabold tracking-tight">
            {formatBRL(PLANS.annual.priceCents)}
          </span>
          <span className="text-xs font-medium text-muted-foreground">/ano</span>
        </p>

        <ul className="mt-3 space-y-1.5 text-[11.5px] leading-snug text-muted-foreground">
          <li className="flex items-start gap-1.5">
            <Check className="mt-px size-3.5 shrink-0 text-primary" />
            <span>Apenas {formatBRL(ANNUAL_MONTHLY_EQUIVALENT_CENTS)} por mês</span>
          </li>
          <li className="flex items-start gap-1.5">
            <Check className="mt-px size-3.5 shrink-0 text-primary" />
            <span>
              Economia de {formatBRL(ANNUAL_SAVINGS_CENTS)} em comparação com 12 mensalidades
            </span>
          </li>
          <li className="flex items-start gap-1.5">
            <Check className="mt-px size-3.5 shrink-0 text-primary" />
            <span>Pagamento anual de {formatBRL(PLANS.annual.priceCents)}</span>
          </li>
        </ul>

        <Button
          type="button"
          onClick={() => choose("annual")}
          disabled={subscribe.isPending}
          className="mt-4 h-11 w-full gap-2 rounded-xl gradient-brand text-[12.5px] font-extrabold uppercase tracking-wide text-primary-foreground shadow-lg shadow-primary/25"
        >
          {loadingPlan === "annual" && <Loader2 className="size-4 animate-spin" />}
          Assinar plano anual
        </Button>
      </section>

      <section className="flex flex-col rounded-2xl border border-border bg-secondary/45 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Plano mensal
        </p>
        <h3 className="mt-1 font-display text-base font-bold">{PLANS.monthly.name}</h3>
        <p className="mt-2 flex items-baseline gap-1">
          <span className="text-2xl font-extrabold tracking-tight">
            {formatBRL(PLANS.monthly.priceCents)}
          </span>
          <span className="text-xs font-medium text-muted-foreground">/mês</span>
        </p>

        <ul className="mt-3 space-y-1.5 text-[11.5px] leading-snug text-muted-foreground">
          <li className="flex items-start gap-1.5">
            <Check className="mt-px size-3.5 shrink-0 text-foreground/70" />
            <span>Acesso completo a todas as ferramentas</span>
          </li>
          <li className="flex items-start gap-1.5">
            <Check className="mt-px size-3.5 shrink-0 text-foreground/70" />
            <span>Renovação a cada 30 dias</span>
          </li>
          <li className="flex items-start gap-1.5">
            <Check className="mt-px size-3.5 shrink-0 text-foreground/70" />
            <span>Cancele quando quiser</span>
          </li>
        </ul>

        <Button
          type="button"
          variant="outline"
          onClick={() => choose("monthly")}
          disabled={subscribe.isPending}
          className="mt-4 h-11 w-full gap-2 rounded-xl border-primary/40 bg-background/40 text-[12.5px] font-extrabold uppercase tracking-wide hover:bg-secondary"
        >
          {loadingPlan === "monthly" && <Loader2 className="size-4 animate-spin" />}
          Assinar plano mensal
        </Button>
      </section>
    </div>
  );
}

function statusNote(state: string): string | null {
  if (state === "pending") {
    return "Seu pagamento está em análise. O acesso é liberado automaticamente assim que a Cakto confirmar.";
  }
  if (state === "refunded") return "O último pagamento foi reembolsado e o acesso foi encerrado.";
  if (state === "chargeback") return "O último pagamento foi contestado e o acesso foi encerrado.";
  if (state === "canceled") return "Sua assinatura foi cancelada e o período pago terminou.";
  if (state === "expired")
    return "Sua assinatura expirou. Escolha um plano para voltar a usar tudo.";
  return null;
}

/** Título da tela. O texto do teste gratuito é exatamente o combinado. */
function gateTitle(state: string): string {
  if (state === "pending") return "Estamos confirmando seu pagamento";
  if (state === "refunded" || state === "chargeback") return "Seu acesso foi encerrado";
  if (state === "expired" || state === "canceled") return "Sua assinatura terminou!";
  return GATE_TITLE;
}

/**
 * Overlay obrigatório após o fim do teste gratuito (ou assinatura inválida).
 * Não pode ser fechado: cobre o app, mas o usuário continua podendo escolher o
 * plano e abrir o pagamento.
 */
export function SubscriptionGate() {
  const { data, isLoading } = useEntitlement();
  const refresh = useRefreshEntitlement();
  const [checking, setChecking] = useState(false);
  const blocked = !!data && !data.has_access;

  useEffect(() => {
    if (!blocked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [blocked]);

  if (isLoading || !data || data.has_access) return null;

  const note = statusNote(data.state);

  async function checkPayment() {
    setChecking(true);
    try {
      await refresh();
      toast.success("Verificamos seu pagamento. Se já foi confirmado, o acesso está liberado.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscription-gate-title"
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-background/85 px-4 py-6 backdrop-blur-md sm:items-center"
    >
      <div className="animate-rise w-full max-w-xl rounded-3xl border border-primary/25 bg-card/95 p-5 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.95)] sm:p-6">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
          <Sparkles className="size-3.5" />
          CompensAI Premium
        </div>

        <h2
          id="subscription-gate-title"
          className="mt-2 font-display text-xl font-extrabold leading-tight sm:text-2xl"
        >
          {gateTitle(data.state)}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{GATE_SUBTITLE}</p>

        {note && (
          <p className="mt-3 rounded-xl border border-border bg-secondary/40 px-3 py-2 text-[11.5px] leading-snug text-muted-foreground">
            {note}
          </p>
        )}

        {data.state === "trial_expired" && data.trial_ends_at && (
          <p className="mt-3 text-[11px] text-muted-foreground/80">
            {describeEntitlement(data)} em{" "}
            {new Date(data.trial_ends_at).toLocaleDateString("pt-BR")}.
          </p>
        )}

        <div className="mt-4">
          <PlanChoices />
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-[10.5px] leading-snug text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0 text-primary" />
            Pagamento seguro pela Cakto · liberação automática após a confirmação
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={checkPayment}
            disabled={checking}
            className="text-[11px] text-muted-foreground"
          >
            {checking ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Já paguei
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Faixa discreta com o tempo restante do teste gratuito. */
export function TrialBanner() {
  const { data } = useEntitlement();
  if (!data || !data.has_access || data.state !== "trial") return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[11.5px]">
      <Sparkles className="size-3.5 shrink-0 text-primary" />
      <span className="font-semibold text-foreground">Teste grátis ativo</span>
      <span className="text-muted-foreground">
        · {formatRemaining(data.trial_hours_remaining ?? 0)} restantes
      </span>
      <Link to="/perfil" className="ml-auto shrink-0 font-bold text-primary hover:underline">
        Assinar
      </Link>
    </div>
  );
}

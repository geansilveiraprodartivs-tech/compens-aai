import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PiggyBank, Sparkles, History, TrendingDown, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveList, useListItems, listTotals } from "@/hooks/useList";
import { brl } from "@/lib/compensai";
import { decodePurchaseNote, type PurchaseSummary } from "@/lib/savings";

export const Route = createFileRoute("/_authenticated/economia")({
  head: () => ({
    meta: [
      { title: "Economia — CompensAI" },
      { name: "description", content: "Acompanhe sua economia real e potencial em cada compra." },
      { property: "og:title", content: "Economia — CompensAI" },
      {
        property: "og:description",
        content: "Acompanhe sua economia real e potencial em cada compra.",
      },
    ],
  }),
  component: EconomiaPage,
});

type SavingsMeta = {
  real_savings: number;
  potential_savings: number;
  note: string | null;
};

type SessionRow = {
  id: string;
  store_name: string | null;
  total_spent: number;
  items_count: number;
  promotions_used: number;
  finished_at: string | null;
  started_at: string;
  savings_records: SavingsMeta[];
};

function EconomiaPage() {
  const { data: list } = useActiveList();
  const { data: items = [] } = useListItems(list?.id);
  const totals = listTotals(items);

  const { data: history = [] } = useQuery({
    queryKey: ["savings"],
    queryFn: async (): Promise<SessionRow[]> => {
      const { data, error } = await supabase
        .from("shopping_sessions")
        .select(
          "id, store_name, total_spent, items_count, promotions_used, finished_at, started_at, savings_records(real_savings, potential_savings, note)",
        )
        .eq("status", "finished")
        .order("finished_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as SessionRow[];
    },
  });

  const totalConfirmed = history.reduce(
    (sum, h) => sum + Number(h.savings_records?.[0]?.real_savings ?? 0),
    0,
  );

  const latest = history[0];
  const latestSummary: PurchaseSummary | null = latest
    ? decodePurchaseNote(latest.savings_records?.[0]?.note)
    : null;

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <PiggyBank className="size-5 text-accent" /> Economia
      </h1>

      <div className="glass glow p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-accent" /> Economia acumulada (confirmada)
        </p>
        <p className="font-display text-3xl font-bold text-gradient">{brl(totalConfirmed)}</p>
        <p className="text-[11px] text-muted-foreground">
          Soma das economias já confirmadas em compras pagas.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="glass p-4">
          <p className="text-xs text-muted-foreground">💰 Nesta compra</p>
          <p className="font-display text-2xl font-bold text-success">{brl(totals.realSavings)}</p>
          <p className="text-[11px] text-muted-foreground">
            realizado nos itens já marcados — confirma ao registrar
          </p>
        </div>
        <div className="glass p-4">
          <p className="text-xs text-muted-foreground">💡 Economia potencial</p>
          <p className="font-display text-2xl font-bold">{brl(totals.potentialSavings)}</p>
          <p className="text-[11px] text-muted-foreground">
            itens ainda não comprados com preço de referência
          </p>
        </div>
      </div>

      {latestSummary && latestSummary.items.length > 0 && (
        <section className="glass p-4">
          <h2 className="flex items-center gap-2 font-bold">
            <Coins className="size-4 text-accent" /> Última compra
          </h2>
          <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <MiniStat label="Gasto" value={brl(latestSummary.paidTotal)} />
            <MiniStat label="Referência" value={brl(latestSummary.referenceTotal)} />
            <MiniStat label="Economia" value={brl(latestSummary.savingTotal)} highlight />
          </div>
          <ul className="mt-3 divide-y divide-border">
            {latestSummary.items.map((it) => (
              <li
                key={`${it.name}-${it.unit}-${it.quantity}`}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  {it.name}{" "}
                  <span className="text-muted-foreground">
                    ({it.quantity} {it.unit})
                  </span>
                </span>
                <span
                  className={`shrink-0 ${it.saving > 0 ? "text-success" : it.overpay > 0 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {it.saving > 0
                    ? `+ ${brl(it.saving)}`
                    : it.overpay > 0
                      ? `- ${brl(it.overpay)}`
                      : brl(0)}
                </span>
              </li>
            ))}
          </ul>
          {latestSummary.overpayTotal > 0 && (
            <p className="mt-2 flex items-center gap-2 text-[11px] text-destructive">
              <TrendingDown className="size-3.5" /> {brl(latestSummary.overpayTotal)} acima da
              referência (não conta como economia).
            </p>
          )}
        </section>
      )}

      <section>
        <h2 className="flex items-center gap-2 font-bold">
          <History className="size-4 text-accent" /> Histórico
        </h2>
        <ul className="mt-3 space-y-2">
          {history.map((h) => {
            const rec = h.savings_records?.[0];
            return (
              <li key={h.id} className="glass p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{h.store_name ?? "Compra"}</p>
                  <p className="font-semibold">{brl(Number(h.total_spent))}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {h.items_count} produtos ·{" "}
                  {h.finished_at
                    ? new Date(h.finished_at).toLocaleDateString("pt-BR")
                    : new Date(h.started_at).toLocaleDateString("pt-BR")}
                </p>
                <p className="mt-1 text-xs text-success">
                  Economia realizada {brl(Number(rec?.real_savings ?? 0))}
                </p>
              </li>
            );
          })}
          {history.length === 0 && (
            <li className="text-sm text-muted-foreground">
              Nenhuma compra registrada ainda. Adicione produtos na Lista e registre o pagamento no
              menu Pagar.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function MiniStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-secondary/50 p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? "text-success" : ""}`}>{value}</p>
    </div>
  );
}

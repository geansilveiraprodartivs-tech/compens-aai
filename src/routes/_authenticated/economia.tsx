import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PiggyBank, Sparkles, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveList, useListItems, listTotals } from "@/hooks/useList";
import { brl } from "@/lib/compensai";

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

function EconomiaPage() {
  const { data: list } = useActiveList();
  const { data: items = [] } = useListItems(list?.id);
  const totals = listTotals(items);

  const { data: history = [] } = useQuery({
    queryKey: ["savings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_sessions")
        .select("id, store_name, total_spent, items_count, promotions_used, finished_at, savings_records(real_savings, potential_savings)")
        .eq("status", "finished")
        .order("finished_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalReal = history.reduce(
    (sum, h) => sum + Number((h.savings_records as { real_savings: number }[])?.[0]?.real_savings ?? 0),
    0,
  );

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <PiggyBank className="size-5 text-accent" /> Economia
      </h1>

      <div className="grid grid-cols-2 gap-3">
        <div className="glass glow p-4">
          <p className="text-xs text-muted-foreground">💰 Economia real</p>
          <p className="font-display text-2xl font-bold text-success">{brl(totals.realSavings)}</p>
          <p className="text-[11px] text-muted-foreground">nesta compra</p>
        </div>
        <div className="glass p-4">
          <p className="text-xs text-muted-foreground">💡 Economia potencial</p>
          <p className="font-display text-2xl font-bold">{brl(totals.potentialSavings)}</p>
          <p className="text-[11px] text-muted-foreground">se escolher as melhores opções</p>
        </div>
      </div>

      <div className="glass p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-accent" /> Economia acumulada
        </p>
        <p className="font-display text-3xl font-bold text-gradient">{brl(totalReal)}</p>
      </div>

      <section>
        <h2 className="flex items-center gap-2 font-bold">
          <History className="size-4 text-accent" /> Histórico
        </h2>
        <ul className="mt-3 space-y-2">
          {history.map((h) => {
            const rec = (h.savings_records as { real_savings: number; potential_savings: number }[])?.[0];
            return (
              <li key={h.id} className="glass p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{h.store_name ?? "Compra"}</p>
                  <p className="font-semibold">{brl(Number(h.total_spent))}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {h.items_count} produtos · {h.promotions_used} promoções ·{" "}
                  {h.finished_at ? new Date(h.finished_at).toLocaleDateString("pt-BR") : ""}
                </p>
                <p className="mt-1 text-xs text-success">
                  Economia real {brl(Number(rec?.real_savings ?? 0))} · potencial{" "}
                  {brl(Number(rec?.potential_savings ?? 0))}
                </p>
              </li>
            );
          })}
          {history.length === 0 && (
            <li className="text-sm text-muted-foreground">
              Nenhuma compra finalizada ainda. Use o modo compra na sua lista.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

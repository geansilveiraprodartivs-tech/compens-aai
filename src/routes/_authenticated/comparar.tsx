import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Scale, Plus, Trash2, Crown, ListPlus, Save, AlertTriangle, History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brl, UNITS } from "@/lib/compensai";
import {
  baseQuantity,
  compareOptions,
  referenceForOption,
  round2,
  toBaseFactor,
  type CompareOption,
} from "@/lib/savings";
import {
  clearComparisons,
  loadComparisons,
  saveComparison,
  type ComparisonRecord,
} from "@/lib/comparisonStore";
import { useActiveList, useItemMutations } from "@/hooks/useList";
import { PhotoCompare } from "@/components/PhotoCompare";

export const Route = createFileRoute("/_authenticated/comparar")({
  head: () => ({
    meta: [
      { title: "Comparar — CompensAI" },
      {
        name: "description",
        content: "Compare marcas, tamanhos e mercados pelo preço por kg, litro ou unidade.",
      },
      { property: "og:title", content: "Comparar — CompensAI" },
      {
        property: "og:description",
        content: "Compare marcas, tamanhos e mercados pelo preço por kg, litro ou unidade.",
      },
    ],
  }),
  component: CompararPage,
});

function CompararPage() {
  const [options, setOptions] = useState<CompareOption[]>([]);
  const [label, setLabel] = useState("");
  const [store, setStore] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [history, setHistory] = useState<ComparisonRecord[]>([]);

  const { data: list } = useActiveList();
  const { add } = useItemMutations(list?.id);

  useEffect(() => {
    setHistory(loadComparisons());
  }, []);

  const num = (v: string) => Number(v.replace(",", ".")) || 0;
  const comparison = useMemo(() => compareOptions(options), [options]);
  const best = comparison.best;

  function addOption(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !num(price) || !num(quantity)) return;
    setOptions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: label.trim(),
        store: store.trim(),
        price: num(price),
        quantity: num(quantity),
        unit,
      },
    ]);
    setLabel("");
    setStore("");
    setPrice("");
    setQuantity("");
  }

  function addToList(o: CompareOption) {
    if (!list) {
      toast.error("Sua lista ainda não está pronta. Tente novamente.");
      return;
    }
    const reference = referenceForOption(o, comparison);
    const { base } = toBaseFactor(o.unit);
    const baseQty = baseQuantity(o.quantity, o.unit);
    if (baseQty <= 0) return;
    add.mutate(
      {
        name: o.label,
        brand: null,
        quantity: baseQty,
        unit: base,
        price: round2(o.price / baseQty),
        reference_price: reference,
      },
      {
        onSuccess: () => {
          toast.success(
            reference
              ? `${o.label} adicionado à lista com preço de referência.`
              : `${o.label} adicionado à lista (sem referência para comparar).`,
          );
        },
        onError: () => toast.error("Não foi possível adicionar à lista."),
      },
    );
  }

  function saveCurrent() {
    if (!best) {
      toast.error("Adicione ao menos uma opção válida para salvar.");
      return;
    }
    const record: ComparisonRecord = {
      id: crypto.randomUUID(),
      at: Date.now(),
      product: options[0]?.label ?? "Comparação",
      options,
      bestLabel: best.label,
      bestStore: comparison.bestStore,
      bestPerBase: round2(best.perBase),
      worstPerBase: round2(comparison.worst?.perBase ?? 0),
      potentialSaving: comparison.potentialSaving,
      comparable: comparison.comparable,
    };
    setHistory(saveComparison(record));
    toast.success("Comparação salva no histórico.");
  }

  const grouped = comparison.options;
  const mixedBases = options.length >= 2 && !comparison.comparable;

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <Scale className="size-5 text-accent" /> Comparar
      </h1>
      <p className="text-sm text-muted-foreground">
        Compare marcas, tamanhos e mercados. Normalizamos as unidades (1 kg = 1000 g, 1 L = 1000 ml)
        para mostrar o melhor custo por unidade de medida.
      </p>

      <PhotoCompare
        count={options.length}
        onAdd={(it) => setOptions((p) => [...p, { id: crypto.randomUUID(), store: "", ...it }])}
      />

      {comparison.hasComparison && best && (
        <div className="glass glow-accent p-4 text-sm">
          <p className="font-semibold">Vale mais a pena: {best.label}</p>
          <p className="text-muted-foreground">
            Menor preço por {best.base}: {brl(best.perBase)}.
            {comparison.bestStore ? ` Em ${comparison.bestStore}.` : ""} Você economiza até{" "}
            <b className="text-success">{brl(comparison.potentialSaving)}</b> comparando com a opção
            mais cara.
          </p>
        </div>
      )}

      {mixedBases && (
        <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Há itens em medidas diferentes (ex.: kg e L). Para comparar de forma justa, use a mesma
          medida em todas as opções.
        </p>
      )}

      {options.length === 1 && (
        <p className="glass p-4 text-sm text-muted-foreground">
          Só há um preço cadastrado. Adicione outro mercado, marca ou tamanho para haver comparação
          suficiente.
        </p>
      )}

      <form onSubmit={addOption} className="glass space-y-3 p-4">
        <Input
          placeholder="Produto / marca"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Input
          placeholder="Mercado (opcional)"
          value={store}
          onChange={(e) => setStore(e.target.value)}
        />
        <div className="grid grid-cols-3 gap-2">
          <Input
            inputMode="decimal"
            placeholder="Preço"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <Input
            inputMode="decimal"
            placeholder="Tamanho"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="rounded-lg border border-input bg-secondary/50 px-3 text-sm"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <Button className="w-full gradient-brand glow">
          <Plus className="mr-2 size-4" /> Adicionar à comparação
        </Button>
      </form>

      {options.length >= 2 && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={saveCurrent}>
            <Save className="mr-2 size-4" /> Salvar comparação
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setOptions([])}
          >
            <Trash2 className="mr-2 size-4" /> Limpar comparação
          </Button>
        </div>
      )}

      <ul className="space-y-2">
        {grouped.map((o, i) => {
          const isBest = best?.id === o.id && comparison.hasComparison;
          const reference = referenceForOption(o, comparison);
          return (
            <li key={o.id} className={`glass p-4 ${isBest ? "glow-accent border-accent/40" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold">
                    {isBest && <Crown className="size-4 shrink-0 text-accent" />}
                    <span className="truncate">{o.label}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {o.store || "sem mercado"} · {o.quantity} {o.unit} · {brl(o.price)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {brl(o.perBase)} / {o.base}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {isBest && <p className="text-xs text-success">melhor custo-benefício</p>}
                  {!isBest && comparison.comparable && o.saving > 0 && (
                    <p className="text-xs text-success">
                      economize {brl(o.saving)}
                      {o.pct ? ` (${o.pct.toFixed(0)}%)` : ""}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <Button
                  size="sm"
                  variant={isBest ? "default" : "outline"}
                  onClick={() => addToList(o)}
                  disabled={add.isPending || !list}
                >
                  <ListPlus className="mr-1.5 size-3.5" /> Adicionar à lista
                </Button>
                {reference != null ? (
                  <span className="text-[11px] text-muted-foreground">
                    referência {brl(reference)} / {o.base}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">sem referência</span>
                )}
                <button
                  className="ml-auto text-xs text-muted-foreground"
                  onClick={() => setOptions((p) => p.filter((x) => x.id !== o.id))}
                  aria-label={`Remover ${o.label}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          );
        })}
        {options.length === 0 && (
          <li className="text-sm text-muted-foreground">
            Adicione duas ou mais opções para ver qual compensa mais.
          </li>
        )}
      </ul>

      {history.length > 0 && (
        <section className="glass p-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <History className="size-4 text-accent" /> Comparações salvas
            </h2>
            <button
              className="text-xs text-muted-foreground"
              onClick={() => {
                clearComparisons();
                setHistory([]);
              }}
            >
              limpar
            </button>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {history.slice(0, 10).map((h) => (
              <li key={h.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{h.product}</span>
                  <span className="text-xs text-success">
                    {h.potentialSaving > 0 ? `até ${brl(h.potentialSaving)}` : "sem diferença"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  melhor: {h.bestLabel ?? "—"}
                  {h.bestStore ? ` (${h.bestStore})` : ""} ·{" "}
                  {new Date(h.at).toLocaleDateString("pt-BR")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

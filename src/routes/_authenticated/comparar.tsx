import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Scale, Plus, Trash2, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brl, unitPrice, UNITS } from "@/lib/compensai";

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

type Option = {
  id: string;
  label: string;
  store: string;
  price: number;
  quantity: number;
  unit: string;
};

function CompararPage() {
  const [options, setOptions] = useState<Option[]>([]);
  const [label, setLabel] = useState("");
  const [store, setStore] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");

  const num = (v: string) => Number(v.replace(",", ".")) || 0;

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

  const ranked = [...options]
    .map((o) => ({ ...o, up: unitPrice(o.price, o.quantity, o.unit) }))
    .sort((a, b) => a.up.value - b.up.value);

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <Scale className="size-5 text-accent" /> Comparar
      </h1>
      <p className="text-sm text-muted-foreground">
        Compare marcas, tamanhos e mercados. Normalizamos as unidades (1 kg = 1000 g, 1 L = 1000 ml)
        para mostrar o melhor custo por unidade de medida.
      </p>

      <form onSubmit={addOption} className="glass space-y-3 p-4">
        <Input placeholder="Produto / marca" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Input placeholder="Mercado (opcional)" value={store} onChange={(e) => setStore(e.target.value)} />
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

      <ul className="space-y-2">
        {ranked.map((o, i) => (
          <li key={o.id} className={`glass p-4 ${i === 0 ? "glow-accent border-accent/40" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-semibold">
                  {i === 0 && <Crown className="size-4 text-accent" />}
                  {o.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {o.store || "sem mercado"} · {o.quantity} {o.unit} · {brl(o.price)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{o.up.label}</p>
                {i === 0 && <p className="text-xs text-success">melhor custo-benefício</p>}
              </div>
            </div>
            <button
              className="mt-2 text-xs text-muted-foreground"
              onClick={() => setOptions((p) => p.filter((x) => x.id !== o.id))}
            >
              <Trash2 className="mr-1 inline size-3" /> remover
            </button>
          </li>
        ))}
        {options.length === 0 && (
          <li className="text-sm text-muted-foreground">
            Adicione duas ou mais opções para ver qual compensa mais.
          </li>
        )}
      </ul>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Minus, Trash2, Check, Flag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useActiveList, useListItems, useItemMutations, listTotals } from "@/hooks/useList";
import { useProfile } from "@/hooks/useProfile";
import { brl, UNITS } from "@/lib/compensai";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/lista")({
  head: () => ({
    meta: [
      { title: "Minha lista — CompensAI" },
      { name: "description", content: "Monte sua lista de compras com total e economia em tempo real." },
      { property: "og:title", content: "Minha lista — CompensAI" },
      {
        property: "og:description",
        content: "Monte sua lista de compras com total e economia em tempo real.",
      },
    ],
  }),
  component: ListaPage,
});

function ListaPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const { data: list } = useActiveList();
  const { data: items = [] } = useListItems(list?.id);
  const { add, update, remove } = useItemMutations(list?.id);
  const totals = listTotals(items);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("un");
  const [pkgSize, setPkgSize] = useState("");
  const [pkgUnit, setPkgUnit] = useState("g");
  const [price, setPrice] = useState("");
  const [reference, setReference] = useState("");
  const [buyMode, setBuyMode] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    add.mutate(
      {
        name: name.trim(),
        brand: brand.trim() || null,
        quantity: Number(quantity) || 1,
        unit,
        price: Number(price.replace(",", ".")) || 0,
        reference_price: reference ? Number(reference.replace(",", ".")) : null,
        package_size: pkgSize ? Number(pkgSize.replace(",", ".")) || null : null,
        package_unit: pkgSize ? pkgUnit : null,
      },
      {
        onSuccess: () => {
          setName("");
          setBrand("");
          setQuantity("1");
          setPrice("");
          setReference("");
          setPkgSize("");
        },
      },
    );
  }

  async function finishPurchase() {
    if (!list) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data: session, error } = await supabase
      .from("shopping_sessions")
      .insert({
        user_id: auth.user.id,
        list_id: list.id,
        budget: profile?.budget ?? null,
        total_spent: totals.spent,
        items_count: totals.checkedCount,
        promotions_used: items.filter((i) => i.checked && i.reference_price).length,
        status: "finished",
        finished_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) {
      toast.error("Não foi possível finalizar a compra.");
      return;
    }
    await supabase.from("savings_records").insert({
      user_id: auth.user.id,
      session_id: session.id,
      real_savings: totals.realSavings,
      potential_savings: totals.potentialSavings,
    });
    await supabase.from("shopping_lists").update({ status: "finished" }).eq("id", list.id);
    qc.invalidateQueries();
    toast.success(
      `🛒 Compra concluída — ${brl(totals.spent)} gastos e ${brl(totals.realSavings)} economizados.`,
    );
    setBuyMode(false);
  }

  const budget = profile?.budget ?? null;

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="glass space-y-3 p-4">
        <h2 className="font-bold">Adicionar produto</h2>
        <Input placeholder="Produto" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Marca (opcional)" value={brand} onChange={(e) => setBrand(e.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          <Input
            inputMode="decimal"
            placeholder="Qtd"
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
          <Input
            inputMode="decimal"
            placeholder="Preço (opcional)"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            inputMode="decimal"
            placeholder="Peso/volume (ex.: 500)"
            value={pkgSize}
            onChange={(e) => setPkgSize(e.target.value)}
          />
          <select
            value={pkgUnit}
            onChange={(e) => setPkgUnit(e.target.value)}
            className="rounded-lg border border-input bg-secondary/50 px-3 text-sm"
          >
            {["g", "kg", "ml", "L"].map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          Pode deixar o preço em branco e preencher no mercado.
        </p>
        <Input
          inputMode="decimal"
          placeholder="Preço de referência (para calcular economia)"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        <Button className="w-full gradient-brand glow">
          <Plus className="mr-2 size-4" /> Adicionar
        </Button>
      </form>

      <section className="glass p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Total da compra</p>
            <p className="font-display text-3xl font-bold">{brl(totals.total)}</p>
            <p className="text-sm text-success">Economia: {brl(totals.realSavings)}</p>
          </div>
          <Button variant={buyMode ? "default" : "outline"} onClick={() => setBuyMode(!buyMode)}>
            {buyMode ? "Sair do modo compra" : "Modo compra"}
          </Button>
        </div>

        {buyMode && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Stat label="Comprados" value={`${totals.checkedCount}/${items.length}`} />
            <Stat label="Gasto até agora" value={brl(totals.spent)} />
            <Stat label="Orçamento" value={budget ? brl(budget) : "não definido"} />
            <Stat
              label="Restante"
              value={budget ? brl(budget - totals.spent) : "—"}
            />
          </div>
        )}
      </section>

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="glass flex items-center gap-3 p-3">
            <Checkbox
              checked={item.checked}
              onCheckedChange={(v) => update.mutate({ id: item.id, checked: Boolean(v) })}
            />
            <div className="min-w-0 flex-1">
              <p className={`truncate font-medium ${item.checked ? "line-through opacity-60" : ""}`}>
                {item.name} {item.brand ? <span className="text-muted-foreground">· {item.brand}</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.unit}
                {item.package_size ? ` de ${item.package_size} ${item.package_unit}` : ""}
                {item.price > 0 ? ` · ${brl(item.quantity * item.price)}` : ""}
              </p>
            </div>
            <QtyStepper
              quantity={item.quantity}
              unit={item.unit}
              onChange={(quantity) => update.mutate({ id: item.id, quantity })}
            />
            <PriceInput
              value={item.price}
              onSave={(price) => update.mutate({ id: item.id, price })}
            />
            <button onClick={() => remove.mutate(item.id)} aria-label="Remover">
              <Trash2 className="size-4 text-muted-foreground" />
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-muted-foreground">Sua lista está vazia.</li>
        )}
      </ul>

      {buyMode && items.length > 0 && (
        <Button onClick={finishPurchase} className="h-12 w-full gradient-brand glow">
          <Check className="mr-2 size-4" /> Finalizar compra
        </Button>
      )}

      {!buyMode && items.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Flag className="size-3.5" /> Ative o modo compra para marcar os produtos enquanto compra.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function QtyStepper({
  quantity,
  unit,
  onChange,
}: {
  quantity: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-secondary/50 p-1">
      <button
        type="button"
        aria-label="Diminuir quantidade"
        onClick={() => onChange(Math.max(1, quantity - 1))}
        className="flex size-7 items-center justify-center rounded-md hover:bg-secondary disabled:opacity-40"
        disabled={quantity <= 1}
      >
        <Minus className="size-3.5" />
      </button>
      <span className="min-w-8 text-center text-sm font-semibold tabular-nums">
        {quantity} {unit}
      </span>
      <button
        type="button"
        aria-label="Aumentar quantidade"
        onClick={() => onChange(quantity + 1)}
        className="flex size-7 items-center justify-center rounded-md hover:bg-secondary"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

function PriceInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [text, setText] = useState(value > 0 ? String(value).replace(".", ",") : "");
  return (
    <Input
      inputMode="decimal"
      placeholder="R$ preço"
      aria-label="Preço"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = Number(text.replace(",", ".")) || 0;
        if (n !== value) onSave(n);
      }}
      className="h-9 w-24 text-right"
    />
  );
}

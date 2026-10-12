import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, RotateCcw, ShieldCheck, Smartphone, Wallet, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useActiveList, useListItems, listTotals } from "@/hooks/useList";
import { usePurchase, type PurchaseResult } from "@/hooks/usePurchase";
import { brl } from "@/lib/compensai";
import { selectPurchaseItems, summarizePurchase, type PurchaseItem } from "@/lib/savings";
import {
  BANK_APPS,
  type BankApp,
  getPlatform,
  isNativeContainer,
  openBankApp,
  platformHint,
} from "@/lib/pix";

export const Route = createFileRoute("/_authenticated/pix")({
  head: () => ({
    meta: [
      { title: "Pagar compra — CompensAI" },
      {
        name: "description",
        content: "Pague sua compra com PIX no app do seu banco e registre no CompensAI.",
      },
      { property: "og:title", content: "Pagar compra — CompensAI" },
      {
        property: "og:description",
        content: "Pague sua compra com PIX no app do seu banco e registre no CompensAI.",
      },
    ],
  }),
  component: PagarCompra,
});

type Payment = { id: string; status: string; created_at: string; paid_at: string | null };

/** Bancos que o usuário removeu da lista (persistido no aparelho). */
const HIDDEN_BANKS_KEY = "compensai.hiddenBanks.v1";

function loadHiddenBanks(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_BANKS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function SummaryStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-secondary/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-semibold ${highlight ? "text-success" : ""}`}>{value}</p>
    </div>
  );
}

function PagarCompra() {
  const [step, setStep] = useState<"start" | "info" | "ask" | "done">("start");
  const [hidden, setHidden] = useState<string[]>([]);
  const [result, setResult] = useState<PurchaseResult | null>(null);

  const { data: list } = useActiveList();
  const { data: items = [] } = useListItems(list?.id);
  const totals = listTotals(items);
  const preview = summarizePurchase(selectPurchaseItems(items));
  const { confirm } = usePurchase(list?.id, items);

  useEffect(() => {
    setHidden(loadHiddenBanks());
  }, []);

  const platform = getPlatform();
  const isNative = isNativeContainer();
  const visibleBanks = BANK_APPS.filter((b) => !hidden.includes(b.id));

  const { data: payments = [] } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_payments")
        .select("id,status,created_at,paid_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
  });

  async function handleOpenBank(bank: BankApp) {
    const res = await openBankApp(bank);
    if (res.opened) {
      toast.info(`Abrindo ${bank.name}. Depois volte para registrar o pagamento.`);
      return;
    }
    if (res.reason === "not-native") {
      toast.error("Disponível apenas no aplicativo instalado no celular.");
      return;
    }
    if (res.reason === "not_configured") {
      toast.error(`Ainda não há um mecanismo de abertura configurado para ${bank.name}.`);
      return;
    }
    toast.error(
      `Não foi possível abrir ${bank.name}. O app pode não estar instalado ou não ser compatível com este aparelho.`,
    );
  }

  function persistHidden(next: string[]) {
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_BANKS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function hideBank(id: string) {
    persistHidden(Array.from(new Set([...hidden, id])));
    toast.info("Banco removido da sua lista.");
  }

  function restoreBanks() {
    persistHidden([]);
    toast.success("Bancos removidos foram restaurados.");
  }

  async function finalize() {
    try {
      const res = await confirm.mutateAsync();
      setResult(res);
      setStep("done");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar a compra.");
    }
  }

  function answer(paid: boolean) {
    if (!paid) {
      toast.info("Compra mantida como não paga.");
      setStep("start");
      return;
    }
    void finalize();
  }

  const paidPayments = payments.filter((p) => p.status === "paid");
  const fmt = (d: string) => new Date(d).toLocaleString("pt-BR");
  const canPay = preview.itemsCount > 0;

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <Wallet className="size-5 text-accent" /> Pagar compra
      </h1>

      <section className="glass space-y-2 p-4">
        <p className="text-sm font-semibold">Compra atual</p>
        {canPay ? (
          <>
            <div className="flex items-end justify-between">
              <p className="text-xs text-muted-foreground">Total a pagar</p>
              <p className="font-display text-2xl font-bold">{brl(preview.paidTotal)}</p>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{preview.itemsCount} produtos</span>
              <span>Economia calculada: {brl(preview.savingTotal)}</span>
            </div>
            {totals.potentialSavings > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Potencial de economia (itens não comprados): {brl(totals.potentialSavings)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sua lista está vazia. Adicione produtos no menu Lista para registrar a compra.
          </p>
        )}
      </section>

      {step !== "done" && (
        <section className="glass space-y-3 p-4">
          {step === "start" && (
            <>
              <p className="text-sm text-muted-foreground">
                Ao registrar a compra, o CompensAI confirma o valor pago de cada produto, calcula a
                economia realizada e guarda no seu histórico.
              </p>
              <Button
                className="h-12 w-full"
                size="lg"
                disabled={!canPay}
                onClick={() => setStep("info")}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <Wallet className="size-4 shrink-0" />
                  <span>Pagar e registrar compra</span>
                </span>
              </Button>
            </>
          )}

          {step === "info" && (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Smartphone className="size-4 text-primary" /> Pagar pelo app do seu banco
              </p>
              <p className="text-sm text-muted-foreground">
                Escolha o banco ou carteira abaixo. O app será aberto para você pagar; depois volte
                para registrar o pagamento.
              </p>

              {visibleBanks.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Você removeu todos os bancos da sua lista. Use “Restaurar” abaixo para trazê-los
                  de volta.
                </p>
              ) : (
                <ul className="space-y-2">
                  {visibleBanks.map((bank) => (
                    <li key={bank.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleOpenBank(bank)}
                        className="flex h-11 flex-1 items-center gap-3 rounded-lg border border-border bg-card/40 px-3 text-left transition-colors hover:bg-accent/10 active:scale-[0.99]"
                      >
                        <img
                          src={bank.icon}
                          alt=""
                          width={32}
                          height={32}
                          loading="lazy"
                          className="size-8 shrink-0 rounded-md object-contain"
                        />
                        <span className="flex-1 text-sm font-medium">{bank.name}</span>
                        <span className="text-xs text-muted-foreground">Abrir</span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => hideBank(bank.id)}
                        aria-label={`Remover ${bank.name}`}
                        className="h-11 w-11 shrink-0 p-0"
                      >
                        <X className="size-4 text-muted-foreground" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {hidden.length > 0 && (
                <Button variant="outline" className="w-full" onClick={restoreBanks}>
                  <RotateCcw className="mr-2 size-4" /> Restaurar bancos removidos ({hidden.length})
                </Button>
              )}

              {!isNative && (
                <p className="text-xs text-muted-foreground">{platformHint(platform)}</p>
              )}

              <Button className="w-full" onClick={() => setStep("ask")}>
                <CheckCircle2 className="mr-2 size-4" /> Já fiz o pagamento
              </Button>

              <Button variant="ghost" className="w-full" onClick={() => setStep("start")}>
                Voltar
              </Button>
            </>
          )}

          {step === "ask" && (
            <>
              <p className="text-center text-lg font-bold">A compra foi paga?</p>
              <p className="rounded-xl bg-secondary/60 p-3 text-sm">
                Vamos registrar <b>{brl(preview.paidTotal)}</b> em <b>{preview.itemsCount}</b>{" "}
                produtos
                {preview.savingTotal > 0 ? (
                  <>
                    {" "}
                    e uma economia de <b className="text-success">{brl(preview.savingTotal)}</b>.
                  </>
                ) : (
                  "."
                )}
              </p>
              <Button className="w-full" onClick={() => answer(true)} disabled={confirm.isPending}>
                {confirm.isPending ? "Registrando…" : "SIM, FOI PAGA"}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => answer(false)}>
                NÃO FOI PAGA
              </Button>
            </>
          )}

          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0 text-primary" /> A confirmação é manual; o
            CompensAI não acessa seu banco nem envia valores.
          </p>
        </section>
      )}

      {step === "done" && result && (
        <section className="glass glow space-y-3 p-4">
          <p className="flex items-center gap-2 text-lg font-bold text-success">
            <CheckCircle2 className="size-5" /> Compra registrada
          </p>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <SummaryStat label="Total gasto" value={brl(result.summary.paidTotal)} />
            <SummaryStat label="Produtos" value={String(result.summary.itemsCount)} />
            <SummaryStat
              label="Economia realizada"
              value={brl(result.summary.savingTotal)}
              highlight
            />
            <SummaryStat label="Valor de referência" value={brl(result.summary.referenceTotal)} />
          </div>

          {result.summary.savingTotal > 0 ? (
            <p className="rounded-xl bg-success/10 p-3 text-sm font-semibold text-success">
              Nesta compra, você economizou {brl(result.summary.savingTotal)}!
            </p>
          ) : (
            <p className="rounded-xl bg-secondary/60 p-3 text-sm text-muted-foreground">
              Economia confirmada: R$ 0,00. Sem dados suficientes para calcular economia nesta
              compra.
            </p>
          )}

          {result.summary.overpayTotal > 0 && (
            <p className="text-xs text-destructive">
              Você pagou {brl(result.summary.overpayTotal)} acima do valor de referência em alguns
              produtos.
            </p>
          )}

          {result.summary.savingItems.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-semibold">Produtos que geraram economia</p>
              <ul className="divide-y divide-border">
                {result.summary.savingItems.map((it: PurchaseItem) => (
                  <li
                    key={`${it.name}-${it.unit}-${it.quantity}`}
                    className="flex items-center justify-between py-1.5 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {it.name}{" "}
                      <span className="text-muted-foreground">
                        ({it.quantity} {it.unit})
                      </span>
                    </span>
                    <span className="shrink-0 text-success">{brl(it.saving)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button
            className="w-full"
            variant="outline"
            onClick={() => {
              setResult(null);
              setStep("start");
            }}
          >
            Concluir
          </Button>
        </section>
      )}

      <section className="glass p-4">
        <p className="mb-2 text-sm font-semibold">Compras pagas</p>
        {paidPayments.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma compra paga ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {paidPayments.slice(0, 10).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span>Paga em {fmt(p.paid_at ?? p.created_at)}</span>
                <CheckCircle2 className="size-4 text-success" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

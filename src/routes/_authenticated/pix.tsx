import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, RotateCcw, ShieldCheck, Smartphone, Wallet, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BANK_APPS, type BankApp, getPlatform, isNativeContainer, openBankApp } from "@/lib/pix";

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

/** Ícone + texto como um único grupo centralizado (ícone e legenda na mesma linha). */
function Group({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center gap-2 text-center">{children}</span>
  );
}

function PagarCompra() {
  const qc = useQueryClient();
  const [step, setStep] = useState<"start" | "info" | "ask">("start");
  const [current, setCurrent] = useState<string | null>(null);

  const platform = getPlatform();
  const isNative = isNativeContainer();

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

  async function startPay(retryId?: string) {
    let id = retryId ?? null;
    if (!id) {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("purchase_payments")
        .insert({ user_id: u.user!.id, method: "pix", status: "pending" })
        .select("id")
        .single();
      if (error) {
        toast.error("Não foi possível iniciar.");
        return;
      }
      id = data.id;
      qc.invalidateQueries({ queryKey: ["payments"] });
    }
    setCurrent(id);
    setStep("info");
  }

  function retryPayment(p: Payment) {
    setCurrent(p.id);
    setStep("info");
  }

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

  async function answer(paid: boolean) {
    if (!current) return;
    await supabase
      .from("purchase_payments")
      .update(paid ? { status: "paid", paid_at: new Date().toISOString() } : { status: "pending" })
      .eq("id", current);
    qc.invalidateQueries({ queryKey: ["payments"] });
    toast[paid ? "success" : "info"](
      paid ? "Compra marcada como paga (confirmação manual)." : "Compra mantida como não paga.",
    );
    setCurrent(null);
    setStep("start");
  }

  const paid = payments.filter((p) => p.status === "paid");
  const pending = payments.filter((p) => p.status !== "paid");
  const fmt = (d: string) => new Date(d).toLocaleString("pt-BR");

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <Wallet className="size-5 text-accent" /> Pagar compra
      </h1>

      <section className="glass space-y-3 p-4">
        {step === "start" && (
          <>
            <p className="text-sm text-muted-foreground">
              Você paga a compra direto no app do seu banco, via PIX. O valor é definido no caixa —
              o CompensAI não mostra, calcula nem envia valores.
            </p>
            <Button className="h-12 w-full" size="lg" onClick={() => startPay()}>
              <Group>
                <Wallet className="size-4 shrink-0" />
                <span>Pagar compra</span>
              </Group>
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

            <ul className="space-y-2">
              {BANK_APPS.map((bank) => (
                <li key={bank.id}>
                  <button
                    type="button"
                    onClick={() => void handleOpenBank(bank)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-card/40 px-3 py-2.5 text-left transition-colors hover:bg-accent/10 active:scale-[0.99]"
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
                </li>
              ))}
            </ul>

            {!isNative && <p className="text-xs text-muted-foreground">{platformHint(platform)}</p>}

            <Button className="w-full" onClick={() => setStep("ask")}>
              <Group>
                <CheckCircle2 className="size-4 shrink-0" />
                <span>Já fiz o pagamento</span>
              </Group>
            </Button>

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setCurrent(null);
                setStep("start");
              }}
            >
              Voltar
            </Button>
          </>
        )}

        {step === "ask" && (
          <>
            <p className="text-center text-lg font-bold">A compra foi paga?</p>
            <Button className="w-full" onClick={() => answer(true)}>
              <Group>
                <CheckCircle2 className="size-4 shrink-0" />
                <span>SIM, FOI PAGA</span>
              </Group>
            </Button>
            <Button variant="outline" className="w-full" onClick={() => answer(false)}>
              <Group>
                <XCircle className="size-4 shrink-0" />
                <span>NÃO, NÃO FOI PAGA</span>
              </Group>
            </Button>
            <p className="text-xs text-muted-foreground">
              Confirmação manual: é informada por você e não representa verificação bancária.
            </p>
          </>
        )}

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0 text-primary" />
          Nunca pedimos senhas, logins ou dados bancários.
        </p>
      </section>

      {pending.length > 0 && (
        <section className="glass p-4">
          <p className="mb-2 text-sm font-semibold">Pendentes / não pagas</p>
          <ul className="divide-y divide-border">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{fmt(p.created_at)}</span>
                <Button size="sm" variant="outline" onClick={() => retryPayment(p)}>
                  <Group>
                    <RotateCcw className="size-3.5 shrink-0" />
                    <span>Tentar de novo</span>
                  </Group>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="glass p-4">
        <p className="mb-2 text-sm font-semibold">Compras Pagas</p>
        {paid.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma compra paga ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {paid.map((p) => (
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

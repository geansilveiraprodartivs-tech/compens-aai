import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, QrCode, RotateCcw, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/pix")({
  head: () => ({
    meta: [
      { title: "Pagar compra — CompensAI" },
      { name: "description", content: "Pague sua compra com Pix pelo app do seu banco e registre no CompensAI." },
      { property: "og:title", content: "Pagar compra — CompensAI" },
      { property: "og:description", content: "Pague sua compra com Pix pelo app do seu banco e registre no CompensAI." },
    ],
  }),
  component: PagarCompra,
});

type Payment = { id: string; status: string; created_at: string; paid_at: string | null };

function PagarCompra() {
  const qc = useQueryClient();
  const [step, setStep] = useState<"start" | "method" | "ask">("start");
  const [current, setCurrent] = useState<string | null>(null);

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

  // Ao voltar do app do banco, perguntar se foi paga
  useEffect(() => {
    if (!current) return;
    const onVis = () => {
      if (document.visibilityState === "visible") setStep("ask");
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [current]);

  async function payWithPix(retryId?: string) {
    let id = retryId ?? null;
    if (!id) {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("purchase_payments")
        .insert({ user_id: u.user!.id, method: "pix", status: "pending" })
        .select("id")
        .single();
      if (error) return toast.error("Não foi possível iniciar.");
      id = data.id;
      qc.invalidateQueries({ queryKey: ["payments"] });
    }
    setCurrent(id);
    // Abre o seletor nativo do sistema (Android "Abrir com..." / iPhone folha de compartilhamento)
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: "Pagar compra com Pix", text: "Pagar compra com Pix" });
      } catch {
        /* usuário fechou o seletor */
      }
    } else {
      toast.info("Abra o app do seu banco e pague com Pix no caixa.");
    }
    setStep("ask");
  }

  async function answer(paid: boolean) {
    if (!current) return;
    await supabase
      .from("purchase_payments")
      .update(paid ? { status: "paid", paid_at: new Date().toISOString() } : { status: "pending" })
      .eq("id", current);
    qc.invalidateQueries({ queryKey: ["payments"] });
    toast[paid ? "success" : "info"](paid ? "Compra marcada como paga." : "Compra mantida como não paga.");
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
              O valor é definido no caixa. O CompensAI não mostra, calcula nem envia valores.
            </p>
            <Button className="w-full" onClick={() => setStep("method")}>Pagar compra</Button>
          </>
        )}
        {step === "method" && (
          <>
            <p className="text-sm font-semibold">Escolha a forma de pagamento</p>
            <Button className="w-full" onClick={() => payWithPix()}>
              <QrCode className="mr-2 size-4" /> Pix
            </Button>
            <p className="text-xs text-muted-foreground">
              Vai abrir o seletor do seu celular para você escolher o app do banco.
            </p>
            <Button variant="ghost" className="w-full" onClick={() => setStep("start")}>Voltar</Button>
          </>
        )}
        {step === "ask" && (
          <>
            <p className="text-center text-lg font-bold">A compra foi paga?</p>
            <Button className="w-full" onClick={() => answer(true)}>
              <CheckCircle2 className="mr-2 size-4" /> SIM, FOI PAGA
            </Button>
            <Button variant="outline" className="w-full" onClick={() => answer(false)}>
              <XCircle className="mr-2 size-4" /> NÃO, NÃO FOI PAGA
            </Button>
            <p className="text-xs text-muted-foreground">
              Essa confirmação é feita por você, não pelo banco.
            </p>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Nunca pedimos senhas, logins ou dados bancários.
        </p>
      </section>

      {pending.length > 0 && (
        <section className="glass p-4">
          <p className="mb-2 text-sm font-semibold">Pendentes / não pagas</p>
          <ul className="divide-y divide-border">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span>{fmt(p.created_at)}</span>
                <Button size="sm" variant="outline" onClick={() => payWithPix(p.id)}>
                  <RotateCcw className="mr-1 size-3.5" /> Tentar de novo
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

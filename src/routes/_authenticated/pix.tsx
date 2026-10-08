import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  copyText,
  createPixPayment,
  getPlatform,
  openBankDeepLink,
  platformHint,
  type PixPayment,
} from "@/lib/pix";

export const Route = createFileRoute("/_authenticated/pix")({
  head: () => ({
    meta: [
      { title: "Pagar compra — CompensAI" },
      {
        name: "description",
        content: "Pague sua compra com PIX (QR Code ou copia-e-cola) e registre no CompensAI.",
      },
      { property: "og:title", content: "Pagar compra — CompensAI" },
      {
        property: "og:description",
        content: "Pague sua compra com PIX (QR Code ou copia-e-cola) e registre no CompensAI.",
      },
    ],
  }),
  component: PagarCompra,
});

type Payment = { id: string; status: string; created_at: string; paid_at: string | null };

function PagarCompra() {
  const qc = useQueryClient();
  const [step, setStep] = useState<"start" | "method" | "pix" | "ask">("start");
  const [current, setCurrent] = useState<string | null>(null);
  const [pix, setPix] = useState<PixPayment | null>(null);
  const [starting, setStarting] = useState(false);
  const [openedBank, setOpenedBank] = useState(false);

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

  // Ao voltar do app do banco (deep link), perguntar se o pagamento foi feito.
  useEffect(() => {
    if (!current || !openedBank) return;
    const onVis = () => {
      if (document.visibilityState === "visible") setStep("ask");
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [current, openedBank]);

  async function payWithPix(retryId?: string) {
    let id = retryId ?? null;
    setStarting(true);
    try {
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

      const payment = await createPixPayment();
      setCurrent(id);
      setPix(payment);
      setOpenedBank(false);
      setStep("pix");

      if (payment.status === "integrated" && payment.deepLink) {
        if (openBankDeepLink(payment.deepLink)) setOpenedBank(true);
      }
    } finally {
      setStarting(false);
    }
  }

  async function copyPixCode() {
    if (!pix || pix.status !== "integrated") return;
    const ok = await copyText(pix.code);
    toast[ok ? "success" : "error"](
      ok
        ? "Código PIX copiado."
        : "Não foi possível copiar automaticamente. Copie o texto abaixo manualmente.",
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
    setPix(null);
    setOpenedBank(false);
    setStep("start");
  }

  const paid = payments.filter((p) => p.status === "paid");
  const pending = payments.filter((p) => p.status !== "paid");
  const fmt = (d: string) => new Date(d).toLocaleString("pt-BR");
  const isIntegrated = pix !== null && pix.status === "integrated";

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
            <Button className="w-full" onClick={() => setStep("method")}>
              <Wallet /> Pagar compra
            </Button>
          </>
        )}
        {step === "method" && (
          <>
            <p className="text-sm font-semibold">Escolha a forma de pagamento</p>
            <Button className="w-full" disabled={starting} onClick={() => payWithPix()}>
              {starting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <QrCode />
              )}
              Pix
            </Button>
            <p className="text-xs text-muted-foreground">{platformHint()}</p>
            <Button variant="ghost" className="w-full" onClick={() => setStep("start")}>
              Voltar
            </Button>
          </>
        )}
        {step === "pix" && pix && (
          <>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="size-4 text-primary" /> Pague no app do seu banco
            </p>

            {isIntegrated ? (
              <>
                <div className="mx-auto flex size-48 items-center justify-center rounded-2xl border border-border bg-background/80 p-2">
                  <img
                    src={`data:image/png;base64,${pix.qrCode}`}
                    alt="QR Code PIX"
                    className="size-full"
                  />
                </div>
                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Código PIX copia e cola
                  </p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{pix.code}</p>
                  <Button className="mt-3 w-full" onClick={copyPixCode}>
                    <Copy /> Copiar código PIX
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto flex size-48 items-center justify-center rounded-2xl border border-dashed border-border bg-background/60">
                  <div className="text-center">
                    <QrCode className="mx-auto size-8 text-muted-foreground/50" />
                    <p className="mt-2 max-w-[180px] px-2 text-xs text-muted-foreground">
                      QR Code gerado quando o PIX estiver conectado a um provedor
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-muted-foreground">
                  <p className="font-bold text-primary">PIX ainda não está integrado a um banco/provedor</p>
                  <p className="mt-1 leading-relaxed">
                    O QR Code e o código copia-e-cola serão gerados automaticamente assim que a
                    integração for ativada. Para isso, falta: (1) credenciais do provedor de
                    pagamento no servidor; (2) criação da cobrança via API; (3) webhook de
                    confirmação. Nenhum valor é cobrado pelo CompensAI.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">Código PIX copia e cola</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Será exibido aqui após a integração com o provedor.
                  </p>
                  <Button className="mt-3 w-full" disabled>
                    <Copy /> Copiar código PIX
                  </Button>
                </div>
              </>
            )}

            <p className="text-xs text-muted-foreground">
              <ShieldCheck className="mr-1 inline size-3.5 text-primary" />
              Nunca pedimos senhas, logins ou dados bancários.
            </p>

            {isIntegrated && pix.deepLink && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  if (openBankDeepLink(pix.deepLink!)) setOpenedBank(true);
                }}
              >
                <ExternalLink /> Abrir app do banco
              </Button>
            )}

            <Button className="w-full" onClick={() => setStep("ask")}>
              <CheckCircle2 /> Já fiz o pagamento
            </Button>
          </>
        )}
        {step === "ask" && (
          <>
            <p className="text-center text-lg font-bold">A compra foi paga?</p>
            <Button className="w-full" onClick={() => answer(true)}>
              <CheckCircle2 /> SIM, FOI PAGA
            </Button>
            <Button variant="outline" className="w-full" onClick={() => answer(false)}>
              <XCircle /> NÃO, NÃO FOI PAGA
            </Button>
            <p className="text-xs text-muted-foreground">
              Confirmação manual: é informada por você e não representa verificação bancária.
            </p>
          </>
        )}
      </section>

      {pending.length > 0 && (
        <section className="glass p-4">
          <p className="mb-2 text-sm font-semibold">Pendentes / não pagas</p>
          <ul className="divide-y divide-border">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{fmt(p.created_at)}</span>
                <Button size="sm" variant="outline" onClick={() => payWithPix(p.id)}>
                  <RotateCcw /> Tentar de novo
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
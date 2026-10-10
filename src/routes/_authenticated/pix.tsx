import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Grid2x2,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  getInstalledBanks,
  getOtherBankApps,
  getPlatform,
  openInstalledBank,
  openPixPicker,
  platformHint,
  type InstalledBank,
  type PickerOutcome,
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

/** Bancos que o usuário removeu da lista pré-definida (persistido no aparelho). */
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
  const [outcome, setOutcome] = useState<PickerOutcome>({ opened: false, reason: "browser" });
  const [banks, setBanks] = useState<InstalledBank[] | null>(null);
  const [otherBanks, setOtherBanks] = useState<InstalledBank[] | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    setHidden(loadHiddenBanks());
  }, []);

  const isNativeAvailable = outcome.opened === false && outcome.reason === "native-available";

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

  /** Lista pré-definida sem os bancos que o usuário removeu. */
  const visibleBanks = (banks ?? []).filter((b) => !hidden.includes(b.id));
  /** Todos os apps de banco/carteira instalados no aparelho (pré-definidos + demais). */
  const deviceBanks = banks && otherBanks ? [...banks, ...otherBanks] : null;

  async function maybeLoadBanks(o: PickerOutcome) {
    if (o.opened === false && o.reason === "native-available") {
      const [known, others] = await Promise.all([getInstalledBanks(), getOtherBankApps()]);
      setBanks(known);
      setOtherBanks(others);
    }
  }

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
    const o = openPixPicker();
    setOutcome(o);
    setBanks(null);
    setOtherBanks(null);
    setShowOthers(false);
    await maybeLoadBanks(o);
    setStep("info");
  }

  function retryPayment(p: Payment) {
    setCurrent(p.id);
    const o = openPixPicker();
    setOutcome(o);
    setBanks(null);
    setOtherBanks(null);
    setShowOthers(false);
    void maybeLoadBanks(o);
    setStep("info");
  }

  async function openBank(id: string) {
    setOpeningId(id);
    const res = await openInstalledBank(id);
    setOpeningId(null);
    if (res.opened) {
      toast.info("Abra o banco e faça o PIX.", { duration: 6000 });
    } else {
      toast.error(
        res.error ? `Não foi possível abrir: ${res.error}` : "Não foi possível abrir o banco.",
      );
    }
  }

  function persistHidden(next: string[]) {
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_BANKS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  /** Remove um banco da lista pré-definida (só da sua lista; reversível). */
  function hideBank(id: string) {
    persistHidden(Array.from(new Set([...hidden, id])));
    toast.info("Banco removido da sua lista.");
  }

  function restoreBanks() {
    persistHidden([]);
    toast.success("Bancos removidos foram restaurados.");
  }

  function toggleOtherBanks() {
    if (!deviceBanks || deviceBanks.length === 0) {
      toast.error("Nenhum app de banco ou carteira digital encontrado neste aparelho.");
      return;
    }
    setShowOthers((v) => !v);
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

  const platform = getPlatform();
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

            {isNativeAvailable ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Escolha o app do banco instalado no seu celular. O CompensAI abre o banco e você
                  faz o PIX por lá — depois volte para registrar.
                </p>
                {banks === null ? (
                  <p className="text-xs text-muted-foreground">
                    Verificando apps de banco instalados…
                  </p>
                ) : visibleBanks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {hidden.length > 0
                      ? "Você removeu todos os bancos da sua lista. Use “Restaurar” abaixo ou veja os apps no dispositivo."
                      : "Nenhum app de banco compatível foi encontrado neste aparelho. Use o botão abaixo para ver os apps instalados."}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {visibleBanks.map((b) => (
                      <li key={b.id} className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          className="h-11 flex-1 justify-between"
                          disabled={openingId !== null}
                          onClick={() => void openBank(b.id)}
                        >
                          <Group>
                            <Wallet className="size-4 shrink-0" />
                            <span>{b.label || b.name}</span>
                          </Group>
                          <span className="text-xs text-muted-foreground">
                            {openingId === b.id ? "Abrindo…" : "Abrir"}
                          </span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={openingId !== null}
                          onClick={() => hideBank(b.id)}
                          aria-label={`Remover ${b.label || b.name} da lista`}
                          title="Remover da minha lista"
                        >
                          <X className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {hidden.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground"
                    onClick={() => restoreBanks()}
                  >
                    <Group>
                      <RotateCcw className="size-3.5 shrink-0" />
                      <span>Restaurar bancos removidos ({hidden.length})</span>
                    </Group>
                  </Button>
                )}
                <Button
                  variant="secondary"
                  className="h-11 w-full justify-between"
                  disabled={openingId !== null}
                  onClick={() => toggleOtherBanks()}
                >
                  <Group>
                    <Grid2x2 className="size-4 shrink-0" />
                    <span>Ver apps de banco no meu dispositivo</span>
                  </Group>
                  <span className="text-xs text-muted-foreground">
                    {showOthers ? "Ocultar" : "Abrir"}
                  </span>
                </Button>
                {showOthers && deviceBanks && deviceBanks.length > 0 && (
                  <ul className="space-y-2">
                    {deviceBanks.map((b) => (
                      <li key={b.id}>
                        <Button
                          variant="outline"
                          className="h-11 w-full justify-between"
                          disabled={openingId !== null}
                          onClick={() => void openBank(b.id)}
                        >
                          <Group>
                            <Wallet className="size-4 shrink-0" />
                            <span>{b.label || b.name}</span>
                          </Group>
                          <span className="text-xs text-muted-foreground">
                            {openingId === b.id ? "Abrindo…" : "Abrir"}
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : outcome.opened === false && outcome.reason === "no-valid-pix-destination" ? (
              <p className="text-sm text-muted-foreground">
                Contêiner nativo detectado, mas o PIX não tem um provedor de pagamento que forneça
                ação e destino válidos do banco para abrir o app correto.
              </p>
            ) : platform === "android" ? (
              <p className="text-sm text-muted-foreground">
                Você está no navegador do Android. O Android não disponibiliza a páginas web um
                seletor nativo de aplicativos de PIX — só aplicativos nativos têm acesso a essa
                escolha. Para habilitá-la, o CompensAI precisa rodar como aplicativo nativo (ex.:
                empacotado com Capacitor) e/ou usar um provedor de pagamento que forneça o destino
                do banco.
              </p>
            ) : platform === "ios" ? (
              <p className="text-sm text-muted-foreground">
                Você está no navegador do iPhone/Safari. O iOS não expõe a páginas web um seletor de
                apps de PIX. Para abrir o app do banco de forma nativa, o CompensAI precisa rodar
                como aplicativo nativo (Universal Links) com um destino de cobrança real de um
                provedor de pagamento.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No navegador de desktop não há seletor de apps. Abra o app do seu banco no celular e
                faça o PIX por lá — depois volte para registrar aqui.
              </p>
            )}
            {!isNativeAvailable && (
              <p className="text-xs text-muted-foreground">{platformHint()}</p>
            )}

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

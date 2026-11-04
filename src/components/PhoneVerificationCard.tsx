import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Phone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkPhoneCode, sendPhoneCode } from "@/lib/phoneVerification.functions";
import {
  PHONE_VERIFICATION_QUERY_KEY,
  usePhoneVerificationStatus,
} from "@/hooks/usePhoneVerification";

function formatVerifiedAt(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Cartão de confirmação de celular por SMS.
 *
 * O código é gerado e conferido na Twilio (Verify); a tela só acompanha o
 * estado devolvido pelo servidor. Nenhuma credencial chega aqui.
 */
export function PhoneVerificationCard({ intro }: { intro?: string }) {
  const qc = useQueryClient();
  const { data: status, isLoading } = usePhoneVerificationStatus();
  const sendCode = useServerFn(sendPhoneCode);
  const verifyCode = useServerFn(checkPhoneCode);

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  // Se já existe um código pendente (ex.: recarregou a tela), respeita o intervalo.
  useEffect(() => {
    if (!status || status.verified) return;
    if (status.can_resend_in_seconds > 0) {
      setCooldown((current) => Math.max(current, status.can_resend_in_seconds));
    }
  }, [status]);

  const send = useMutation({
    mutationFn: (value: string) => sendCode({ data: { phone: value } }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setCode("");
        setStep("code");
        setCooldown(result.retry_after_seconds ?? 60);
        void qc.invalidateQueries({ queryKey: PHONE_VERIFICATION_QUERY_KEY });
        return;
      }
      toast.error(result.message);
      if (result.retry_after_seconds && result.retry_after_seconds > 0) {
        setCooldown(result.retry_after_seconds);
      }
      if (result.reason === "already_verified") {
        void qc.invalidateQueries({ queryKey: PHONE_VERIFICATION_QUERY_KEY });
      }
    },
    onError: () => {
      toast.error("Não foi possível pedir o código agora. Tente novamente.");
    },
  });

  const verify = useMutation({
    mutationFn: (input: { phone: string; code: string }) => verifyCode({ data: input }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setCode("");
        setStep("phone");
        void qc.invalidateQueries({ queryKey: PHONE_VERIFICATION_QUERY_KEY });
        return;
      }
      toast.error(result.message);
      if (result.reason === "expired" || result.reason === "no_pending") setStep("phone");
      if (result.retry_after_seconds && result.retry_after_seconds > 0) {
        setCooldown(result.retry_after_seconds);
      }
    },
    onError: () => {
      toast.error("Não foi possível confirmar o código agora. Tente novamente.");
    },
  });

  if (isLoading) {
    return (
      <section className="glass flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando celular...
      </section>
    );
  }

  const verifiedAt = formatVerifiedAt(status?.verified_at ?? null);

  if (status?.verified) {
    return (
      <section className="glass space-y-2 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Phone className="size-4 text-accent" /> Celular
        </p>
        <p className="flex items-center gap-2 text-sm font-semibold text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          Confirmado{status.phone_masked ? `: ${status.phone_masked}` : ""}
        </p>
        {verifiedAt && (
          <p className="text-xs text-muted-foreground">Confirmado em {verifiedAt} por SMS.</p>
        )}
      </section>
    );
  }

  const configured = status?.configured ?? false;
  const sending = send.isPending;
  const waiting = cooldown > 0;

  return (
    <section className="glass space-y-3 p-4">
      <div className="flex items-start gap-2">
        <Phone className="mt-0.5 size-4 shrink-0 text-accent" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Celular</p>
          <p className="text-xs leading-snug text-muted-foreground">
            {intro ??
              "Confirme seu celular por SMS. Cada celular vale para um único teste gratuito e seus dados ficam protegidos."}
          </p>
        </div>
      </div>

      {!configured && (
        <p className="rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-[11.5px] leading-snug text-amber-100">
          O envio de SMS ainda não está configurado no servidor. Você pode continuar usando o app
          normalmente.
        </p>
      )}

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!configured || sending || waiting) return;
          send.mutate(phone);
        }}
      >
        <Label htmlFor="phone-verification-input">Celular com DDD</Label>
        <Input
          id="phone-verification-input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(51) 98583-9571"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          disabled={!configured || sending}
        />
        <Button
          type="submit"
          className="w-full gradient-brand"
          disabled={!configured || sending || waiting || phone.trim().length < 8}
        >
          {sending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {waiting
            ? `Reenviar em ${cooldown}s`
            : step === "code"
              ? "Reenviar código"
              : "Enviar código por SMS"}
        </Button>
      </form>

      {step === "code" && (
        <form
          className="space-y-2 border-t border-border pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (verify.isPending || code.trim().length < 4) return;
            verify.mutate({ phone, code: code.trim() });
          }}
        >
          <Label htmlFor="phone-verification-code">Código recebido no SMS</Label>
          <Input
            id="phone-verification-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            disabled={verify.isPending}
          />
          <Button
            type="submit"
            variant="outline"
            className="w-full"
            disabled={verify.isPending || code.trim().length < 4}
          >
            {verify.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Confirmar código
          </Button>
          <button
            type="button"
            className="w-full text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => {
              setStep("phone");
              setCode("");
            }}
          >
            Trocar número
          </button>
        </form>
      )}

      <p className="flex items-start gap-1.5 text-[10.5px] leading-snug text-muted-foreground">
        <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary" />O código é gerado pela
        Twilio e nunca é guardado pelo CompensAI. O número fica só na sua conta.
      </p>
    </section>
  );
}

/**
 * Gate obrigatório de confirmação de celular.
 *
 * Só aparece quando `PHONE_VERIFICATION_REQUIRED=true`, o SMS está configurado
 * e a conta está no teste gratuito (`phoneGateApplies` no servidor). Conta paga,
 * administrador e trial encerrado nunca são bloqueados por aqui.
 */
export function PhoneVerificationGate() {
  const { data } = usePhoneVerificationStatus();
  const blocked = !!data && data.gate_applies && !data.verified;

  useEffect(() => {
    if (!blocked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [blocked]);

  if (!blocked) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="phone-gate-title"
      className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-background/85 px-4 py-6 backdrop-blur-md sm:items-center"
    >
      <div className="animate-rise w-full max-w-md rounded-3xl border border-primary/25 bg-card/95 p-5 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.95)] sm:p-6">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
          <ShieldCheck className="size-3.5" /> Confirmação de celular
        </div>
        <h2
          id="phone-gate-title"
          className="mt-2 font-display text-xl font-extrabold leading-tight"
        >
          Confirme seu celular para continuar
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          Enviamos um código por SMS para confirmar que o número é seu. Cada celular vale para um
          único teste gratuito.
        </p>
        <div className="mt-4">
          <PhoneVerificationCard intro="Informe o celular que vai receber o código de confirmação." />
        </div>
        <p className="mt-3 text-[10.5px] leading-snug text-muted-foreground">
          Assinantes do plano não precisam confirmar celular.
        </p>
      </div>
    </div>
  );
}

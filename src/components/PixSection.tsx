import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCheck, ShieldCheck, Smartphone, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signupSearch } from "@/lib/trialOffer";

/**
 * "Pagar compra" já está disponível no app: o CompensAI abre a lista de bancos
 * e carteiras digitais, a pessoa escolhe a que usa, paga o PIX no app do banco
 * e volta para registrar a compra.
 *
 * A lista abaixo é só de leitura (marketing) — espelha `BANK_APPS` de
 * `src/lib/pix.ts`, que é a fonte real usada na tela `/pix`. Importar aquele
 * módulo aqui carregaria os plugins nativos no site público, então os nomes
 * ficam como texto.
 */
const BANKS = [
  "Nubank",
  "CAIXA",
  "CAIXA Tem",
  "Banco do Brasil",
  "Bradesco",
  "Itaú",
  "Santander",
  "Inter",
  "C6 Bank",
  "Banco PAN",
  "PicPay",
  "Mercado Pago",
  "PagBank",
] as const;

const WALLETS = ["Carteira do Google", "Samsung Wallet"] as const;

export function PixSection() {
  return (
    <section className="mx-auto max-w-6xl pb-20">
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card p-6 shadow-2xl glow md:p-10">
        <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative grid items-center gap-10 md:grid-cols-[1.2fr_.8fr]">
          <div className="animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-extrabold text-primary-foreground">
              <Zap className="size-3.5" /> Já disponível no app
            </span>
            <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-primary">
              <Wallet className="size-4" /> Pagar compra
            </p>
            <h2 className="mt-2 text-3xl font-extrabold leading-tight md:text-4xl">
              Pague suas compras pelo CompensAI
            </h2>
            <p className="mt-4 max-w-lg text-muted-foreground">
              Ao finalizar a compra, toque em <strong>Pagar compra</strong> e escolha o{" "}
              <strong>banco ou a carteira digital da sua preferência</strong> — você pode trocar
              quando quiser, esconder os que não usa e deixar um banco padrão salvo. O app do banco
              abre direto no PIX e, na volta, o CompensAI registra a compra e calcula sua economia.
            </p>

            <ul className="mt-4 flex flex-wrap gap-1.5">
              {[...BANKS, ...WALLETS].map((name) => (
                <li
                  key={name}
                  className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
                >
                  {name}
                </li>
              ))}
            </ul>

            <p className="mt-4 flex items-start gap-2 text-xs leading-snug text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />O valor é o definido
              no caixa do mercado: o CompensAI não cobra nem envia pagamentos.
            </p>

            <Button
              asChild
              size="lg"
              className="mt-7 h-auto w-full whitespace-normal py-3 font-bold glow sm:w-auto"
            >
              <Link to="/auth" search={signupSearch()}>
                Criar conta e pagar pelo app <ArrowRight />
              </Link>
            </Button>
          </div>

          <div className="relative mx-auto w-full max-w-[260px]">
            <div className="absolute -left-6 -top-4 z-10 flex animate-float items-center gap-2 rounded-xl border border-border bg-card/90 px-3 py-2 shadow-xl backdrop-blur">
              <Smartphone className="size-4 text-primary" />
              <p className="text-xs font-bold">Escolha seu banco</p>
            </div>
            <div className="absolute -bottom-4 -right-4 z-10 flex animate-float items-center gap-2 rounded-xl border border-border bg-card/90 px-3 py-2 shadow-xl backdrop-blur [animation-delay:-3s]">
              <ShieldCheck className="size-4 text-primary" />
              <p className="text-xs font-bold">Seguro e prático</p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 p-6 shadow-xl transition-transform duration-500 hover:-translate-y-1">
              <div className="mx-auto flex size-40 items-center justify-center rounded-xl bg-background/70">
                <CheckCheck className="size-16 text-primary/80" strokeWidth={1.2} />
              </div>
              <p className="mt-3 flex items-start justify-center gap-1 text-center text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> Confirmação feita por você, não
                pelo banco.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

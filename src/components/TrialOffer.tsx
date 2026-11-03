import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, CheckCheck, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleSignUpButton } from "@/components/GoogleSignUpButton";
import {
  TRIAL_OFFER,
  TRIAL_OFFER_BENEFITS,
  TRIAL_OFFER_HOURS,
  signupSearch,
} from "@/lib/trialOffer";

/**
 * Seção de destaque da página inicial: teste gratuito de 48 horas com acesso a
 * todas as funcionalidades + os dois caminhos de CADASTRO (e-mail/senha e
 * Google) e o link discreto para quem já tem conta.
 *
 * Os botões levam ao cadastro (`/auth?modo=cadastro`), nunca ao login; o botão
 * do Google inicia o OAuth já existente no projeto.
 */
export function TrialOffer() {
  return (
    <section aria-labelledby="teste-gratis" className="mx-auto max-w-6xl pb-12">
      <div className="relative overflow-hidden rounded-3xl border border-primary/35 bg-card p-6 shadow-2xl glow animate-rise md:p-10">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-20 size-56 rounded-full bg-accent/10 blur-3xl" />
        <span className="absolute right-4 top-4 hidden items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-extrabold text-primary sm:inline-flex">
          <Clock3 className="size-3.5" />
          {TRIAL_OFFER_HOURS}h
        </span>

        <div className="relative grid gap-8 md:grid-cols-[1.1fr_.9fr] md:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-primary">
              <Clock3 className="size-3.5" />
              {TRIAL_OFFER.badge}
            </p>
            <h2
              id="teste-gratis"
              className="mt-4 font-display text-2xl font-extrabold leading-tight tracking-tight text-shine sm:text-3xl md:text-[2.15rem]"
            >
              {TRIAL_OFFER.title}
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
              {TRIAL_OFFER.body}
            </p>
            <p className="mt-5 flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3.5 py-3 text-xs font-semibold leading-snug text-primary sm:text-sm">
              <CheckCheck className="mt-0.5 size-4 shrink-0" />
              <span>{TRIAL_OFFER.note}</span>
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-secondary/45 p-4 shadow-lg sm:p-5">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">
              Crie sua conta agora
            </p>
            <div className="mt-3 grid gap-2.5">
              <Button
                asChild
                size="lg"
                className="h-auto w-full whitespace-normal py-3 text-center font-bold leading-snug gradient-brand text-primary-foreground shadow-lg shadow-primary/25"
              >
                <Link to="/auth" search={signupSearch()}>
                  {TRIAL_OFFER.emailCta}
                  <ArrowRight className="size-4 shrink-0" />
                </Link>
              </Button>
              <GoogleSignUpButton
                label={TRIAL_OFFER.googleCta}
                className="h-auto w-full whitespace-normal py-3 leading-snug"
              />
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {TRIAL_OFFER.existingAccountLabel}{" "}
              <Link
                to="/auth"
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                {TRIAL_OFFER.existingAccountCta}
              </Link>
            </p>
            <p className="mt-2 text-center text-[11px] leading-snug text-muted-foreground/80">
              {TRIAL_OFFER.signupHint}
            </p>
          </div>
        </div>

        <ul className="relative mt-8 grid gap-2 border-t border-border/70 pt-5 text-xs text-muted-foreground sm:grid-cols-3">
          {TRIAL_OFFER_BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 leading-snug">
              <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

import { ArrowRight, QrCode, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const ANNUAL_CHECKOUT_URL = "https://pay.cakto.com.br/893demw";

export function PixSection() {
  return (
    <section className="mx-auto max-w-6xl pb-20">
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card p-6 shadow-2xl glow md:p-10">
        <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative grid items-center gap-10 md:grid-cols-[1.2fr_.8fr]">
          <div className="animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-extrabold text-primary-foreground animate-ai-pulse">🚀 Em breve!</span>
            <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-primary"><Zap className="size-4" /> Pagar compra · Pix</p>
            <h2 className="mt-2 text-3xl font-extrabold leading-tight md:text-4xl">Pague suas compras pelo CompensAI</h2>
            <p className="mt-4 max-w-lg text-muted-foreground">Em breve, você poderá pagar suas compras de forma rápida e prática usando Pix e QR Code diretamente pelo CompensAI.</p>
            <Button asChild size="lg" className="mt-7 h-auto w-full whitespace-normal py-3 font-bold glow sm:w-auto">
              <a href={ANNUAL_CHECKOUT_URL} target="_blank" rel="noreferrer">Quero usar quando estiver disponível <ArrowRight /></a>
            </Button>
          </div>
          <div className="relative mx-auto w-full max-w-[260px]">
            <div className="absolute -left-6 -top-4 z-10 flex animate-float items-center gap-2 rounded-xl border border-border bg-card/90 px-3 py-2 shadow-xl backdrop-blur"><Zap className="size-4 text-primary" /><p className="text-xs font-bold">Pix instantâneo</p></div>
            <div className="absolute -bottom-4 -right-4 z-10 flex animate-float items-center gap-2 rounded-xl border border-border bg-card/90 px-3 py-2 shadow-xl backdrop-blur [animation-delay:-3s]"><ShieldCheck className="size-4 text-primary" /><p className="text-xs font-bold">Seguro e prático</p></div>
            <div className="rounded-2xl border border-border bg-secondary/50 p-6 shadow-xl transition-transform duration-500 hover:-translate-y-1">
              <QrCode className="mx-auto size-40 text-primary/80" strokeWidth={1.2} />
              <p className="mt-3 text-center text-xs text-muted-foreground">Prévia ilustrativa · ainda não disponível</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

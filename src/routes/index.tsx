import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, QrCode, ShieldCheck, Zap, Camera, CheckCheck, MapPin, PiggyBank, Scale, Sparkles, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import shareImage from "@/assets/compensai-green-share.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CompensAI — Pare de gastar mais do que precisa" },
      {
        name: "description",
        content:
          "O CompensAI compara mercados perto de você, mostra o que compensa comprar e quanto você economiza em cada compra.",
      },
      { property: "og:title", content: "CompensAI — Pare de gastar mais do que precisa" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:description",
        content: "Compare mercados, monte sua lista e saiba exatamente quanto está economizando.",
      },
      {
        property: "og:image",
        content: `https://compens-aai.lovable.app${shareImage.url}`,
      },
      {
        name: "twitter:image",
        content: `https://compens-aai.lovable.app${shareImage.url}`,
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: MapPin, title: "Onde comprar", text: "Mercados próximos da sua localização." },
  { icon: Trophy, title: "Top 5 mercados", text: "Ranking por preço, promoções e distância." },
  { icon: Scale, title: "Comparar", text: "Preço por kg, litro ou unidade, já normalizado." },
  { icon: PiggyBank, title: "Economia", text: "Economia real e potencial em cada compra." },
];

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-background/90 px-5 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between"><Brand size={40} /><Button asChild variant="outline"><Link to="/auth">Entrar</Link></Button></div>
      </header>
      <main className="mx-auto grid min-h-[calc(100vh-73px)] max-w-6xl items-center gap-12 px-5 py-12 lg:grid-cols-[1.1fr_.9fr]">
        <section className="animate-rise">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary"><Sparkles className="size-3.5 animate-ai-pulse" /> Inteligência que pensa com você antes de gastar</p>
          <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
            Pare de gastar <span className="text-primary">mais do que precisa.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            O CompensAI ajuda você a planejar suas compras, montar sua lista e encontrar formas mais inteligentes de economizar — para o seu dinheiro render mais todos os meses.
          </p>
          <Button asChild size="lg" className="mt-8 w-full px-6 font-bold glow sm:w-auto"><Link to="/auth">Começar a economizar <ArrowRight /></Link></Button>
          <div className="mt-8 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-lg border border-border px-3 py-2"><Camera className="mr-1 inline size-3.5 text-primary" /> Foto</span><ArrowRight className="size-3" />
            <span className="rounded-lg border border-border px-3 py-2">IA identifica</span><ArrowRight className="size-3" />
            <span className="rounded-lg border border-border px-3 py-2"><CheckCheck className="mr-1 inline size-3.5 text-primary" /> Lista atualizada</span>
          </div>
        </section>

        <div className="relative animate-rise [animation-delay:150ms]">
          <div className="absolute -left-3 -top-5 z-10 flex animate-float items-center gap-2 rounded-xl border border-border bg-card/90 px-3 py-2 shadow-xl backdrop-blur md:-left-8"><PiggyBank className="size-4 text-primary" /><div><p className="text-[10px] text-muted-foreground">Economia acompanhada</p><p className="text-xs font-bold">Real e potencial</p></div></div>
          <div className="absolute -bottom-5 -right-2 z-10 flex animate-float items-center gap-2 rounded-xl border border-border bg-card/90 px-3 py-2 shadow-xl backdrop-blur [animation-delay:-3s] md:-right-6"><Sparkles className="size-4 text-primary animate-ai-pulse" /><p className="text-xs font-bold">Sugestão inteligente</p></div>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div className="mb-5 flex items-center justify-between"><p className="font-display text-lg font-bold">Central de compras</p><span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">CompensAI</span></div>
          <div className="grid grid-cols-2 gap-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-xl border border-border bg-secondary/45 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
                <Icon className="size-5 text-primary" /><p className="mt-3 font-semibold">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>
        </div>
      </main>
      <PixSection />
    </div>
  );
}

const ANNUAL_CHECKOUT_URL = "https://pay.cakto.com.br/893demw";

function PixSection() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-20">
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card p-6 shadow-2xl glow md:p-10">
        <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative grid items-center gap-10 md:grid-cols-[1.2fr_.8fr]">
          <div className="animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-extrabold text-primary-foreground animate-ai-pulse">🚀 Em breve!</span>
            <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-primary"><Zap className="size-4" /> Pagamento via Pix</p>
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

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Camera, CheckCheck, MapPin, PiggyBank, Scale, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import shareImage from "@/assets/compensai-green-share.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CompensAI — Onde compensa comprar?" },
      {
        name: "description",
        content:
          "O CompensAI compara mercados perto de você, mostra o que compensa comprar e quanto você economiza em cada compra.",
      },
      { property: "og:title", content: "CompensAI — Onde compensa comprar?" },
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
        <section>
          <p className="mb-4 text-sm font-bold text-primary">SUA COMPRA SOB CONTROLE</p>
          <h1 className="max-w-2xl text-4xl font-extrabold leading-tight md:text-6xl">
            Saiba o valor da sua compra <span className="text-primary">antes de chegar ao caixa.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Fotografe produtos, monte sua lista e acompanhe o total enquanto compara as ofertas oficiais dos mercados.
          </p>
          <Button asChild size="lg" className="mt-8 h-12 px-6 font-bold glow"><Link to="/auth">Controlar minha próxima compra <ArrowRight /></Link></Button>
          <div className="mt-8 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-lg border border-border px-3 py-2"><Camera className="mr-1 inline size-3.5 text-primary" /> Foto</span><ArrowRight className="size-3" />
            <span className="rounded-lg border border-border px-3 py-2">IA identifica</span><ArrowRight className="size-3" />
            <span className="rounded-lg border border-border px-3 py-2"><CheckCheck className="mr-1 inline size-3.5 text-primary" /> Lista atualizada</span>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-2xl">
          <div className="mb-5 flex items-center justify-between"><p className="font-display text-lg font-bold">Central de compras</p><span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">CompensAI</span></div>
          <div className="grid grid-cols-2 gap-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-lg border border-border bg-secondary/45 p-4">
                <Icon className="size-5 text-primary" /><p className="mt-3 font-semibold">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

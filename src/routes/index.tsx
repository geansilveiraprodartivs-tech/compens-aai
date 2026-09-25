import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { MapPin, Trophy, Scale, PiggyBank } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";

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
      {
        property: "og:description",
        content: "Compare mercados, monte sua lista e saiba exatamente quanto está economizando.",
      },
      {
        property: "og:image",
        content:
          "https://compens-aai.lovable.app/__l5e/assets-v1/27615e7e-c1e2-4c0c-a2cb-4b74f8c1bc73/og-image.jpg",
      },
      {
        name: "twitter:image",
        content:
          "https://compens-aai.lovable.app/__l5e/assets-v1/27615e7e-c1e2-4c0c-a2cb-4b74f8c1bc73/og-image.jpg",
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
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-5 py-12">
      <Brand size={52} />
      <h1 className="mt-10 text-4xl font-bold leading-tight">
        Onde compensa <span className="text-gradient">comprar?</span>
      </h1>
      <p className="mt-3 text-muted-foreground">
        O CompensAI reúne preços e promoções dos mercados da sua região, monta sua lista e mostra
        quanto você economiza — de verdade.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="glass p-4">
            <Icon className="size-5 text-accent" />
            <p className="mt-2 font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>

      <Button asChild className="mt-8 h-12 w-full gradient-brand glow text-base">
        <Link to="/auth">Começar agora</Link>
      </Button>
    </div>
  );
}

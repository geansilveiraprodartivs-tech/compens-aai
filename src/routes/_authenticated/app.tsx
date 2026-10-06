import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { RefreshCw, Trophy, MapPin, ShoppingCart, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { LocationSetup } from "@/components/LocationSetup";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useProfile";
import { useActiveList, useListItems, listTotals } from "@/hooks/useList";
import { useEffect, useState } from "react";
import { getWeeklyOffers } from "@/lib/offers.functions";
type Ranking = Awaited<ReturnType<typeof getWeeklyOffers>>;
import { brl, relativeTime } from "@/lib/compensai";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Início — CompensAI" },
      { name: "description", content: "Veja onde compensa comprar perto de você hoje." },
      { property: "og:title", content: "Início — CompensAI" },
      { property: "og:description", content: "Veja onde compensa comprar perto de você hoje." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { data: profile, isLoading } = useProfile();
  const { data: list } = useActiveList();
  const { data: items = [] } = useListItems(list?.id);
  const refresh = useServerFn(getWeeklyOffers);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const city = profile?.city ?? profile?.location_label ?? "";
  useEffect(() => {
    const raw = city && localStorage.getItem(`offers:${city}`);
    setRanking(raw ? JSON.parse(raw) : null);
  }, [city]);
  const totals = listTotals(items);

  const doRefresh = useMutation({
    mutationFn: () => {
      if (!city) throw new Error("sem cidade");
      return refresh({ data: { city } });
    },
    onSuccess: (res) => {
      setRanking(res);
      localStorage.setItem(`offers:${city}`, JSON.stringify(res));
      toast.success("Ranking atualizado com as ofertas da semana.");
    },
    onError: () =>
      toast.error("Não foi possível ler os sites dos mercados agora. Tente de novo em instantes."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  if (!profile?.location_label) {
    return <LocationSetup />;
  }

  return (
    <div className="space-y-6">
      <div className="pt-1"><p className="text-sm font-semibold text-primary">Central de compras</p><h1 className="mt-1 text-2xl font-bold">Onde compensa comprar hoje?</h1></div>
      <div className="grid gap-4 lg:grid-cols-2">
      <section className="glass p-4">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5 text-accent" /> Minha localização
        </p>
        <p className="mt-1 font-semibold">{profile.location_label}</p>
        <Link to="/perfil" className="text-xs text-accent">
          Alterar localização
        </Link>
      </section>

      <section className="glass glow p-4">
        <p className="text-xs text-muted-foreground">Compra atual</p>
        <p className="font-display text-3xl font-bold">{brl(totals.total)}</p>
        <p className="text-sm text-success">Economia: {brl(totals.realSavings)}</p>
        <Button asChild variant="outline" className="mt-3 w-full">
          <Link to="/lista">
            <ShoppingCart className="mr-2 size-4" /> Abrir minha lista ({items.length})
          </Link>
        </Button>
      </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Trophy className="size-5 text-accent" /> Melhores ofertas da semana
          </h2>
          <Button size="sm" variant="ghost" onClick={() => doRefresh.mutate()} disabled={doRefresh.isPending}>
            <RefreshCw className={`mr-1 size-4 ${doRefresh.isPending ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {doRefresh.isPending && (
          <p className="mt-3 text-sm text-muted-foreground">Lendo os sites dos mercados... pode levar até 1 minuto.</p>
        )}

        {!ranking && !doRefresh.isPending && (
          <div className="glass mt-3 space-y-2 p-4">
            <p className="text-sm text-muted-foreground">
              Toque para ranquear Cestto, Atacadão, Macromix, Asun e Fort pelas ofertas publicadas nos sites deles esta semana.
            </p>
            <Button variant="outline" className="w-full" onClick={() => doRefresh.mutate()}>
              <RefreshCw className="mr-2 size-4" /> Buscar ofertas da semana
            </Button>
          </div>
        )}

        {ranking && (
          <ul className="mt-3 divide-y divide-border">
            {ranking.stores.map((s, index) => (
              <li key={s.name} className={`py-4 ${index === 0 ? "text-foreground" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-primary">#{index + 1}</p>
                    <p className="font-display text-lg font-bold">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.offersCount > 0
                        ? `${s.offersCount} ofertas publicadas esta semana`
                        : "Ofertas não identificadas automaticamente"}
                    </p>
                  </div>
                  <Button asChild size="sm" variant={index === 0 ? "default" : "outline"}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      Ver ofertas <ExternalLink className="ml-1 size-3.5" />
                    </a>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {ranking && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {ranking.city} · atualizado {relativeTime(ranking.updatedAt)}
          </p>
        )}
      </section>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Trophy, MapPin, AlertTriangle, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { LocationSetup } from "@/components/LocationSetup";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useProfile";
import { useActiveList, useListItems, listTotals } from "@/hooks/useList";
import { useTopStores } from "@/hooks/useNearbyStores";
import { refreshPrices } from "@/lib/prices.functions";
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
  const qc = useQueryClient();
  const { data: profile, isLoading } = useProfile();
  const { data: list } = useActiveList();
  const { data: items = [] } = useListItems(list?.id);
  const { data: stores = [], isLoading: loadingStores } = useTopStores(profile);
  const refresh = useServerFn(refreshPrices);
  const totals = listTotals(items);

  const doRefresh = useMutation({
    mutationFn: () => {
      const city = profile?.city ?? profile?.location_label;
      if (!city) throw new Error("sem cidade");
      return refresh({
        data: { city, state: null, lat: profile?.lat ?? null, lng: profile?.lng ?? null },
      });
    },
    onSuccess: (res) => {
      toast[res.status === "ok" ? "success" : "info"](res.message);
      qc.invalidateQueries({ queryKey: ["top-stores"] });
    },
    onError: () =>
      toast.error("Não foi possível ler os sites dos mercados agora. Tente de novo em instantes."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  if (!profile?.location_label) {
    return <LocationSetup />;
  }

  return (
    <div className="space-y-5">
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

      <section>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Trophy className="size-5 text-accent" /> Onde compensa comprar?
          </h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => doRefresh.mutate()}
            disabled={doRefresh.isPending}
          >
            <RefreshCw className={`mr-1 size-4 ${doRefresh.isPending ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {loadingStores && <p className="mt-3 text-sm text-muted-foreground">Calculando...</p>}

        {!loadingStores && stores.length === 0 && (
          <div className="glass mt-3 space-y-2 p-4">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-4 text-accent" /> Sem dados de preço na sua região
            </p>
            <p className="text-sm text-muted-foreground">
              Ainda não há nenhuma fonte oficial de preços conectada para esta região, então não
              exibimos nenhum valor. Assim que um site, encarte ou feed oficial de supermercado for
              conectado, o ranking aparece aqui automaticamente.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => doRefresh.mutate()}
              disabled={doRefresh.isPending}
            >
              <RefreshCw className="mr-2 size-4" /> Atualizar preços
            </Button>
          </div>
        )}

        <ul className="mt-3 space-y-3">
          {stores.map((store, index) => (
            <li
              key={store.locationId}
              className={`glass p-4 ${index === 0 ? "glow-accent border-accent/40" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">#{index + 1}</p>
                  <p className="font-display text-lg font-bold">{store.storeName}</p>
                  <p className="text-xs text-muted-foreground">
                    {store.label ?? "—"}
                    {store.distance != null ? ` · ${store.distance.toFixed(1)} km` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {store.estimatedTotal > 0 ? brl(store.estimatedTotal) : "sem preço"}
                  </p>
                  {store.savings > 0 && (
                    <p className="text-xs text-success">+{brl(store.savings)} a mais</p>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{store.reason}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Atualizado {relativeTime(store.lastUpdate)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

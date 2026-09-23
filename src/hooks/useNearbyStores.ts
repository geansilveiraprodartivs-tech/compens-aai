import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { distanceKm } from "@/lib/compensai";
import type { Profile } from "@/hooks/useProfile";

export type StoreOffer = {
  title: string;
  promoPrice: number | null;
  regularPrice: number | null;
  sourceUrl: string | null;
  endsAt: string | null;
};

export type RankedStore = {
  locationId: string;
  storeName: string;
  label: string | null;
  distance: number | null;
  estimatedTotal: number;
  savings: number;
  promotions: number;
  coveredItems: number;
  lastUpdate: string | null;
  reason: string;
  offers: StoreOffer[];
};

/**
 * Ranking dos 5 mercados com as melhores promoções da semana, a partir de dados
 * REAIS coletados dos sites oficiais. Sem coleta, devolve lista vazia.
 */
export function useTopStores(profile: Profile | null | undefined) {
  return useQuery({
    queryKey: ["top-stores", profile?.lat, profile?.lng, profile?.city],
    enabled: !!profile,
    queryFn: async (): Promise<RankedStore[]> => {
      const now = new Date().toISOString();

      const { data: locations, error } = await supabase
        .from("store_locations")
        .select("id, label, city, neighborhood, lat, lng, stores(name)");
      if (error) throw error;
      if (!locations?.length) return [];

      const { data: prices } = await supabase
        .from("product_prices")
        .select("store_location_id, price, collected_at, valid_until, is_promotion")
        .or(`valid_until.is.null,valid_until.gte.${now}`);

      const { data: promos } = await supabase
        .from("promotions")
        .select("store_location_id, title, promo_price, regular_price, source_url, ends_at")
        .or(`ends_at.is.null,ends_at.gte.${now}`);

      const base = locations.map((loc) => {
        const distance =
          profile?.lat != null && profile?.lng != null && loc.lat != null && loc.lng != null
            ? distanceKm({ lat: profile.lat, lng: profile.lng }, { lat: loc.lat, lng: loc.lng })
            : null;
        const rows = (prices ?? []).filter((p) => p.store_location_id === loc.id);
        const storePromos = (promos ?? []).filter((p) => p.store_location_id === loc.id);
        const discount = storePromos.reduce(
          (sum, p) =>
            sum + Math.max(0, Number(p.regular_price ?? 0) - Number(p.promo_price ?? 0)),
          0,
        );
        return {
          locationId: loc.id,
          storeName: (loc.stores as { name: string } | null)?.name ?? "Mercado",
          label: loc.label,
          distance,
          estimatedTotal: rows.reduce((sum, p) => sum + Number(p.price), 0),
          promotions: storePromos.length,
          discount,
          coveredItems: rows.length,
          lastUpdate: [...rows.map((p) => p.collected_at)].sort().at(-1) ?? null,
          offers: storePromos
            .slice()
            .sort(
              (a, b) =>
                Number(b.regular_price ?? 0) -
                Number(b.promo_price ?? 0) -
                (Number(a.regular_price ?? 0) - Number(a.promo_price ?? 0)),
            )
            .slice(0, 3)
            .map((p) => ({
              title: p.title,
              promoPrice: p.promo_price != null ? Number(p.promo_price) : null,
              regularPrice: p.regular_price != null ? Number(p.regular_price) : null,
              sourceUrl: p.source_url,
              endsAt: p.ends_at,
            })),
        };
      });

      const priced = base.filter((s) => s.estimatedTotal > 0).map((s) => s.estimatedTotal);
      const cheapest = priced.length ? Math.min(...priced) : 0;

      return base
        .map((s) => {
          const score =
            s.promotions * 8 +
            s.discount * 2 +
            (s.estimatedTotal > 0 ? 40 - (s.estimatedTotal - cheapest) / 10 : 0) +
            s.coveredItems -
            (s.distance ?? 5) * 2 +
            (s.lastUpdate ? 10 : 0);
          return {
            locationId: s.locationId,
            storeName: s.storeName,
            label: s.label,
            distance: s.distance,
            estimatedTotal: s.estimatedTotal,
            promotions: s.promotions,
            coveredItems: s.coveredItems,
            lastUpdate: s.lastUpdate,
            offers: s.offers,
            savings: s.estimatedTotal > 0 ? Math.max(0, s.estimatedTotal - cheapest) : 0,
            reason: [
              s.promotions
                ? `${s.promotions} promoções da semana no site oficial`
                : "sem promoções publicadas",
              s.distance != null ? `${s.distance.toFixed(1)} km de você` : null,
              s.lastUpdate ? "dados recentes" : "dados desatualizados",
            ]
              .filter(Boolean)
              .join(" · "),
            score,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    },
  });
}

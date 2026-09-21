import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { distanceKm } from "@/lib/compensai";
import type { Profile } from "@/hooks/useProfile";

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
};

/**
 * Ranking dos mercados a partir de dados REAIS de preço já coletados.
 * Sem dados de preço, devolve lista vazia — nada é estimado artificialmente.
 */
export function useTopStores(profile: Profile | null | undefined) {
  return useQuery({
    queryKey: ["top-stores", profile?.lat, profile?.lng, profile?.city],
    enabled: !!profile,
    queryFn: async (): Promise<RankedStore[]> => {
      const { data: locations, error } = await supabase
        .from("store_locations")
        .select("id, label, city, neighborhood, lat, lng, stores(name)");
      if (error) throw error;
      if (!locations?.length) return [];

      const { data: prices } = await supabase
        .from("product_prices")
        .select("store_location_id, price, collected_at, valid_until, is_promotion")
        .or(`valid_until.is.null,valid_until.gte.${new Date().toISOString()}`);

      const base = locations.map((loc) => {
        const distance =
          profile?.lat != null && profile?.lng != null && loc.lat != null && loc.lng != null
            ? distanceKm({ lat: profile.lat, lng: profile.lng }, { lat: loc.lat, lng: loc.lng })
            : null;
        const rows = (prices ?? []).filter((p) => p.store_location_id === loc.id);
        return {
          locationId: loc.id,
          storeName: (loc.stores as { name: string } | null)?.name ?? "Mercado",
          label: loc.label,
          distance,
          estimatedTotal: rows.reduce((sum, p) => sum + Number(p.price), 0),
          promotions: rows.filter((p) => p.is_promotion).length,
          coveredItems: rows.length,
          lastUpdate: [...rows.map((p) => p.collected_at)].sort().at(-1) ?? null,
        };
      });

      const priced = base.filter((s) => s.estimatedTotal > 0).map((s) => s.estimatedTotal);
      const cheapest = priced.length ? Math.min(...priced) : 0;

      return base
        .map((s) => {
          const score =
            (s.estimatedTotal > 0 ? 100 - (s.estimatedTotal - cheapest) : 0) +
            s.promotions * 5 +
            s.coveredItems * 2 -
            (s.distance ?? 5) * 2 +
            (s.lastUpdate ? 10 : 0);
          return {
            ...s,
            savings: s.estimatedTotal > 0 ? Math.max(0, s.estimatedTotal - cheapest) : 0,
            reason: [
              s.estimatedTotal > 0 ? "preços coletados da fonte oficial" : "sem preços coletados",
              s.promotions ? `${s.promotions} promoções válidas` : null,
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

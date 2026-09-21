// Utilitários de domínio do CompensAI: moeda, normalização de unidades e distância.

export const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(value) ? value : 0,
  );

export const UNITS = ["un", "g", "kg", "ml", "L"] as const;
export type Unit = (typeof UNITS)[number];

/** Converte quantidade para a unidade base (kg, L ou un). */
export function toBase(quantity: number, unit: string): { qty: number; base: "kg" | "L" | "un" } {
  switch (unit) {
    case "g":
      return { qty: quantity / 1000, base: "kg" };
    case "kg":
      return { qty: quantity, base: "kg" };
    case "ml":
      return { qty: quantity / 1000, base: "L" };
    case "L":
      return { qty: quantity, base: "L" };
    default:
      return { qty: quantity, base: "un" };
  }
}

/** Preço por kg / L / unidade, já normalizado (1kg = 1000g, 1L = 1000ml). */
export function unitPrice(price: number, quantity: number, unit: string) {
  const { qty, base } = toBase(quantity, unit);
  if (!qty) return { value: 0, base, label: "—" };
  const value = price / qty;
  return { value, base, label: `${brl(value)} / ${base}` };
}

/** Distância aproximada em km entre dois pontos (Haversine). */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const relativeTime = (iso?: string | null) => {
  if (!iso) return "sem atualização";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "agora há pouco";
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)} dias`;
};

export const isStale = (iso?: string | null, hours = 48) =>
  !iso || Date.now() - new Date(iso).getTime() > hours * 3_600_000;

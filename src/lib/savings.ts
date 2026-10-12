// Cálculo de economia real do CompensAI.
// Módulo puro (sem dependências) para poder ser testado isoladamente.
//
// Regra central: preço e preço de referência são SEMPRE preços por unidade
// (por "un", "g", "kg", "ml" ou "L"). A economia de uma compra é
// (preço de referência - preço pago) × quantidade.
//
// Comparações normalizam tudo para a unidade-base (kg, L ou un) antes de decidir
// qual opção compensa, para só comparar produtos equivalentes.

export type MeasureBase = "kg" | "L" | "un";

/** Fator para a unidade base e qual base é (1 kg = 1000 g, 1 L = 1000 ml). */
export function toBaseFactor(unit: string): { factor: number; base: MeasureBase } {
  switch (unit) {
    case "g":
      return { factor: 0.001, base: "kg" };
    case "kg":
      return { factor: 1, base: "kg" };
    case "ml":
      return { factor: 0.001, base: "L" };
    case "L":
      return { factor: 1, base: "L" };
    default:
      return { factor: 1, base: "un" };
  }
}

/** Quantidade convertida para a unidade base. */
export function baseQuantity(quantity: number, unit: string): number {
  return quantity * toBaseFactor(unit).factor;
}

/** Preço por unidade base (por kg / L / un). */
export function perBasePrice(price: number, quantity: number, unit: string): number {
  const q = baseQuantity(quantity, unit);
  if (!q) return 0;
  return price / q;
}

export const round2 = (value: number) =>
  Math.round((value + (value >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100;

/* ----------------------------- Comparação ----------------------------- */

export type CompareOption = {
  id: string;
  label: string;
  store: string;
  price: number;
  quantity: number;
  unit: string;
};

export type RankedOption = CompareOption & {
  perBase: number;
  base: MeasureBase;
  baseQty: number;
  /** Quanto custaria esta quantidade pelo menor preço por unidade encontrado. */
  equivalent: number;
  /** Quanto se economiza escolhendo o melhor em vez desta opção (positivo = economia). */
  saving: number;
  pct: number;
};

export type Comparison = {
  options: RankedOption[];
  /** Todos os itens na mesma base (kg, L ou un)? */
  comparable: boolean;
  /** Há comparação suficiente (2+ opções comparáveis com preços válidos). */
  hasComparison: boolean;
  best: RankedOption | null;
  worst: RankedOption | null;
  /** Maior economia possível escolhendo o melhor preço. */
  potentialSaving: number;
  bestStore: string | null;
};

/**
 * Normaliza e ranqueia opções do mesmo produto. Compara apenas itens na mesma
 * base de medida; mistura de bases (kg com L, por exemplo) não é comparável.
 */
export function compareOptions(options: CompareOption[]): Comparison {
  const ranked: RankedOption[] = options
    .filter((o) => o.price > 0 && o.quantity > 0)
    .map((o) => {
      const { base } = toBaseFactor(o.unit);
      const baseQty = baseQuantity(o.quantity, o.unit);
      const perBase = perBasePrice(o.price, o.quantity, o.unit);
      return { ...o, base, baseQty, perBase, equivalent: o.price, saving: 0, pct: 0 };
    })
    .sort((a, b) => a.perBase - b.perBase);

  const bases = new Set(ranked.map((r) => r.base));
  const comparable = bases.size <= 1;
  const best = ranked[0] ?? null;
  const worst = ranked.length ? (ranked[ranked.length - 1] as RankedOption) : null;
  const hasComparison = comparable && ranked.length >= 2;

  let potentialSaving = 0;
  if (best) {
    for (const r of ranked) {
      r.equivalent = round2(r.baseQty * best.perBase);
      r.saving = round2(r.price - r.equivalent);
      r.pct = r.price ? round2((r.saving / r.price) * 100) : 0;
      if (comparable && r.saving > potentialSaving) potentialSaving = r.saving;
    }
  }

  return {
    options: ranked,
    comparable,
    hasComparison,
    best,
    worst,
    potentialSaving: round2(potentialSaving),
    bestStore: best && best.store ? best.store : null,
  };
}

/**
 * Preço de referência (por unidade do item) para adicionar uma opção à lista,
 * usando o menor preço por unidade encontrado. Retorna null se não comparável.
 */
export function referenceForOption(option: CompareOption, comparison: Comparison): number | null {
  const best = comparison.best;
  if (!best || !comparison.comparable) return null;
  const { base } = toBaseFactor(option.unit);
  if (base !== best.base) return null;
  return round2(best.perBase);
}

/* --------------------------- Economia por item --------------------------- */

export type PricedItem = {
  name: string;
  quantity: number;
  unit: string;
  price: number;
  reference_price: number | null;
};

export type LineSaving = {
  comparable: boolean;
  diffPerUnit: number;
  saving: number;
  overpay: number;
  pct: number;
};

/**
 * Economia de uma linha: (referência - pago) × quantidade.
 * Pagar mais que a referência vira "overpay" (diferença negativa), nunca economia.
 * Sem preço pago ou sem referência, não há economia calculável.
 */
export function lineSavings(item: PricedItem): LineSaving {
  const ref = item.reference_price;
  const comparable = typeof ref === "number" && ref > 0 && item.price > 0 && item.quantity > 0;
  if (!comparable) {
    return { comparable: false, diffPerUnit: 0, saving: 0, overpay: 0, pct: 0 };
  }
  const diffPerUnit = (ref as number) - item.price;
  const gross = diffPerUnit * item.quantity;
  return {
    comparable: true,
    diffPerUnit: round2(diffPerUnit),
    saving: round2(gross > 0 ? gross : 0),
    overpay: round2(gross < 0 ? -gross : 0),
    pct: round2(((ref as number) ? diffPerUnit / (ref as number) : 0) * 100),
  };
}

/* --------------------------- Resumo da compra --------------------------- */

export type PurchaseItem = {
  name: string;
  unit: string;
  quantity: number;
  reference_price: number | null;
  paid_price: number;
  reference_total: number;
  paid_total: number;
  saving: number;
  overpay: number;
  pct: number;
};

export type PurchaseSummary = {
  items: PurchaseItem[];
  itemsCount: number;
  unitsCount: number;
  paidTotal: number;
  referenceTotal: number;
  savingTotal: number;
  overpayTotal: number;
  savingItems: PurchaseItem[];
};

export function summarizePurchase(items: PricedItem[]): PurchaseSummary {
  const mapped: PurchaseItem[] = items.map((i) => {
    const l = lineSavings(i);
    const paidTotal = round2(i.quantity * (i.price || 0));
    const referenceTotal = l.comparable
      ? round2(i.quantity * (i.reference_price as number))
      : paidTotal;
    return {
      name: i.name,
      unit: i.unit,
      quantity: i.quantity,
      reference_price: l.comparable ? i.reference_price : null,
      paid_price: i.price,
      reference_total: referenceTotal,
      paid_total: paidTotal,
      saving: l.saving,
      overpay: l.overpay,
      pct: l.pct,
    };
  });

  const sum = (key: "paid_total" | "reference_total" | "saving" | "overpay") =>
    round2(mapped.reduce((acc, x) => acc + x[key], 0));

  return {
    items: mapped,
    itemsCount: mapped.length,
    unitsCount: round2(mapped.reduce((acc, x) => acc + x.quantity, 0)),
    paidTotal: sum("paid_total"),
    referenceTotal: sum("reference_total"),
    savingTotal: sum("saving"),
    overpayTotal: sum("overpay"),
    savingItems: mapped.filter((x) => x.saving > 0),
  };
}

/**
 * Itens que entram na compra: os marcados como comprados; se nenhum estiver
 * marcado, considera a lista inteira (fluxo do menu Pagar).
 */
export function selectPurchaseItems<T extends { checked?: boolean }>(items: T[]): T[] {
  const checked = items.filter((i) => i.checked);
  return checked.length > 0 ? checked : items;
}

/* -------------------------- Nota persistida (DB) -------------------------- */

export const PURCHASE_NOTE_VERSION = 1;

export function encodePurchaseNote(summary: PurchaseSummary): string {
  return JSON.stringify({ v: PURCHASE_NOTE_VERSION, summary });
}

export function decodePurchaseNote(note: string | null | undefined): PurchaseSummary | null {
  if (!note) return null;
  try {
    const parsed = JSON.parse(note) as { v?: number; summary?: PurchaseSummary };
    if (!parsed || parsed.v !== PURCHASE_NOTE_VERSION || !parsed.summary) return null;
    if (!Array.isArray(parsed.summary.items)) return null;
    return parsed.summary;
  } catch {
    return null;
  }
}

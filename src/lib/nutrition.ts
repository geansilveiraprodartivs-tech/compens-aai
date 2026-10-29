// Domínio da seção "Calorias" (módulo puro: sem imports, testável isoladamente).
//
// Regras de produto:
//  - NUNCA inventar valores. Campo sem dado = null e a interface mostra "—".
//  - Toda análise carrega a ORIGEM do dado: rótulo lido, Open Food Facts ou
//    estimativa pela imagem. A interface precisa deixar isso explícito.
//  - O histórico não guarda fotos (privacidade) e é isolado por usuário.

export type NutritionGoal = "lose" | "maintain" | "gain" | "know";

export const NUTRITION_GOALS: { value: NutritionGoal; label: string; hint: string }[] = [
  {
    value: "lose",
    label: "Emagrecer com saúde",
    hint: "Saciedade, fibras e densidade nutricional.",
  },
  { value: "maintain", label: "Manter o peso", hint: "Equilíbrio entre rotina e prazer." },
  { value: "gain", label: "Ganhar massa muscular", hint: "Proteína e energia por porção." },
  { value: "know", label: "Só conhecer os valores", hint: "Informação, sem julgamento." },
];

export function goalLabel(goal: NutritionGoal): string {
  return NUTRITION_GOALS.find((g) => g.value === goal)?.label ?? "Seu objetivo";
}

export type Nutrients = {
  kcal: number | null;
  carbs: number | null;
  protein: number | null;
  fat: number | null;
  sat_fat: number | null;
  trans_fat: number | null;
  fiber: number | null;
  sugar: number | null;
  /** Sempre em miligramas. */
  sodium: number | null;
};

export const EMPTY_NUTRIENTS: Nutrients = {
  kcal: null,
  carbs: null,
  protein: null,
  fat: null,
  sat_fat: null,
  trans_fat: null,
  fiber: null,
  sugar: null,
  sodium: null,
};

/** De onde vieram os números — a interface mostra isso em destaque. */
export type DataOrigin = "label" | "openfoodfacts" | "estimate" | "unknown";

export const ORIGIN_LABELS: Record<DataOrigin, string> = {
  label: "Lido do rótulo",
  openfoodfacts: "Base Open Food Facts",
  estimate: "Estimativa pela imagem",
  unknown: "Sem dados confiáveis",
};

export const ORIGIN_HINTS: Record<DataOrigin, string> = {
  label: "Valores transcritos da tabela nutricional que aparece na foto.",
  openfoodfacts:
    "Valores de base pública colaborativa (Open Food Facts) para este produto. Confira o rótulo da sua embalagem.",
  estimate:
    "Valores aproximados, estimados pela imagem com tabelas de composição. Podem variar conforme marca, preparo e porção.",
  unknown: "Não foi possível ler valores nutricionais com segurança nesta foto.",
};

export type FitVerdict = "good" | "balanced" | "moderation" | "alternative";

export const VERDICTS: Record<FitVerdict, { label: string; className: string }> = {
  good: {
    label: "Boa opção para seu objetivo",
    className: "border-success/40 bg-success/10 text-success",
  },
  balanced: {
    label: "Pode fazer parte de uma alimentação equilibrada",
    className: "border-primary/40 bg-primary/10 text-primary",
  },
  moderation: {
    label: "Consuma com moderação",
    className: "border-accent/40 bg-accent/10 text-accent",
  },
  alternative: {
    label: "Considere uma alternativa",
    className: "border-border bg-secondary/60 text-muted-foreground",
  },
};

export type FoodSuggestion = { name: string; why: string };

export type Portion = { label: string; grams: number | null; nutrients: Nutrients };

export type FoodAnalysis = {
  ok: boolean;
  name: string;
  brand: string | null;
  category: string | null;
  origin: DataOrigin;
  /** Objetivo usado na avaliação (fica registrado no histórico). */
  goal: NutritionGoal;
  /** Base dos valores de referência: 100 g ou 100 ml. */
  basis: "100 g" | "100 ml";
  per100: Nutrients;
  portion: Portion;
  ingredients: string | null;
  benefits: string[];
  cautions: string[];
  fit: { verdict: FitVerdict; reason: string };
  better_choices: FoodSuggestion[];
  balance_tips: string[];
  source_name: string | null;
  source_url: string | null;
  problem: string | null;
};

/* ------------------------------------------- composição (fontes em prioridade) */

/** Formato bruto que a IA devolve (antes de qualquer confiança). */
export type AiFoodPayload = {
  ok?: boolean;
  name?: string;
  brand?: string | null;
  category?: string | null;
  basis?: string | null;
  label_read?: boolean;
  barcode?: string | null;
  serving_size_text?: string | null;
  serving_grams?: number | null;
  label?: Partial<Nutrients> | null;
  estimate?: Partial<Nutrients> | null;
  ingredients?: string | null;
  benefits?: unknown;
  cautions?: unknown;
  verdict?: string | null;
  verdict_reason?: string | null;
  better_choices?: unknown;
  balance_tips?: unknown;
  problem?: string | null;
};

/** Produto encontrado na base Open Food Facts (já normalizado). */
export type OffMatch = {
  nutrients: Nutrients;
  name: string | null;
  brands: string | null;
  code: string | null;
  servingSize: string | null;
  servingQuantity: number | null;
  ingredients: string | null;
};

export function cleanText(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function cleanList(value: unknown, max = 4, maxLen = 220): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxLen))
    .filter((item): item is string => !!item)
    .slice(0, max);
}

export function cleanSuggestions(value: unknown): FoodSuggestion[] {
  if (!Array.isArray(value)) return [];
  const out: FoodSuggestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const name = cleanText((item as FoodSuggestion).name, 80);
    const why = cleanText((item as FoodSuggestion).why, 160);
    if (name && why) out.push({ name, why });
    if (out.length >= 3) break;
  }
  return out;
}

const VERDICT_VALUES: FitVerdict[] = ["good", "balanced", "moderation", "alternative"];

function clampPortion(value: unknown): number | null {
  const grams = toNumber(value);
  if (grams == null || grams <= 0) return null;
  return Math.min(Math.max(grams, 1), 5000);
}

/**
 * Monta a análise final respeitando a prioridade das fontes:
 * rótulo lido > Open Food Facts > estimativa pela imagem > sem dados.
 * Nunca mistura fontes dentro do mesmo conjunto de valores.
 */
export function composeAnalysis(
  payload: AiFoodPayload,
  off: OffMatch | null,
  goal: NutritionGoal,
): FoodAnalysis {
  const name = cleanText(payload.name, 90) ?? "";
  if (payload.ok === false || !name) {
    return unknownAnalysis(
      cleanText(payload.problem, 180) ?? "Não consegui identificar o alimento nesta foto.",
      name || null,
      goal,
    );
  }

  const basis: "100 g" | "100 ml" = payload.basis === "100 ml" ? "100 ml" : "100 g";
  const label = sanitizeNutrients(payload.label ?? {});
  const estimate = sanitizeNutrients(payload.estimate ?? {});

  let origin: DataOrigin = "unknown";
  let per100: Nutrients = { ...EMPTY_NUTRIENTS };

  if (payload.label_read === true && hasNutrition(label)) {
    origin = "label";
    per100 = label;
  } else if (off && hasNutrition(off.nutrients)) {
    origin = "openfoodfacts";
    per100 = off.nutrients;
  } else if (hasNutrition(estimate)) {
    origin = "estimate";
    per100 = estimate;
  }

  const aiGrams = clampPortion(payload.serving_grams);
  const servingGrams = aiGrams ?? clampPortion(off?.servingQuantity);
  const servingLabel = aiGrams
    ? (cleanText(payload.serving_size_text, 40) ?? cleanText(off?.servingSize, 40))
    : (cleanText(off?.servingSize, 40) ?? cleanText(payload.serving_size_text, 40));
  const portion = buildPortion(per100, servingGrams, servingLabel, basis);

  const offName = off?.name ?? null;
  const sourceName =
    origin === "openfoodfacts"
      ? `${offName ?? "Open Food Facts"}${off?.brands ? ` · ${off.brands}` : ""}`.slice(0, 120)
      : null;

  const verdict: FitVerdict = VERDICT_VALUES.includes(payload.verdict as FitVerdict)
    ? (payload.verdict as FitVerdict)
    : "balanced";

  const reason =
    cleanText(payload.verdict_reason, 320) ??
    (origin === "unknown"
      ? "Sem valores nutricionais confiáveis, não dá para avaliar o encaixe no seu objetivo."
      : "Avaliação geral considerando porção e contexto alimentar.");

  return {
    ok: true,
    name,
    brand: cleanText(payload.brand, 60),
    category: cleanText(payload.category, 50),
    origin,
    goal,
    basis,
    per100,
    portion,
    ingredients: cleanText(payload.ingredients, 600) ?? cleanText(off?.ingredients, 600),
    benefits: cleanList(payload.benefits, 4),
    cautions: cleanList(payload.cautions, 4),
    fit: { verdict, reason },
    better_choices: cleanSuggestions(payload.better_choices),
    balance_tips: cleanList(payload.balance_tips, 4),
    source_name: sourceName,
    source_url:
      origin === "openfoodfacts"
        ? off?.code
          ? `https://world.openfoodfacts.org/product/${off.code}`
          : "https://world.openfoodfacts.org"
        : null,
    problem:
      origin === "unknown"
        ? (cleanText(payload.problem, 180) ??
          "Não encontrei valores nutricionais confiáveis para este item.")
        : null,
  };
}

/** Resposta neutra quando nada pôde ser lido (nunca inventa valores). */
export function unknownAnalysis(
  problem: string,
  name: string | null = null,
  goal: NutritionGoal = "know",
): FoodAnalysis {
  return {
    ok: false,
    name: name ?? "",
    brand: null,
    category: null,
    origin: "unknown",
    goal,
    basis: "100 g",
    per100: { ...EMPTY_NUTRIENTS },
    portion: { label: "100 g", grams: null, nutrients: { ...EMPTY_NUTRIENTS } },
    ingredients: null,
    benefits: [],
    cautions: [],
    fit: {
      verdict: "balanced",
      reason: "Sem dados nutricionais confiáveis não há como avaliar o encaixe no seu objetivo.",
    },
    better_choices: [],
    balance_tips: [],
    source_name: null,
    source_url: null,
    problem,
  };
}

/* --------------------------------------------------------------- utilidades */

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Número vindo de JSON/planilha/rótulo; null quando não é um valor válido. */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value
      .replace(/[^\d.,-]/g, "")
      .replace(/\.(?=\d{3}\b)/g, "")
      .replace(",", ".");
    if (!cleaned || !/\d/.test(cleaned)) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sane(value: number | null, max: number, digits = 1): number | null {
  if (value == null || !Number.isFinite(value) || value < 0 || value > max) return null;
  return round(value, digits);
}

/** Limita valores absurdos (protege contra leitura errada do rótulo). */
export function sanitizeNutrients(input: Partial<Nutrients>): Nutrients {
  return {
    kcal: sane(input.kcal ?? null, 900, 0),
    carbs: sane(input.carbs ?? null, 100),
    protein: sane(input.protein ?? null, 100),
    fat: sane(input.fat ?? null, 100),
    sat_fat: sane(input.sat_fat ?? null, 100),
    trans_fat: sane(input.trans_fat ?? null, 100),
    fiber: sane(input.fiber ?? null, 100),
    sugar: sane(input.sugar ?? null, 100),
    sodium: sane(input.sodium ?? null, 20000, 0),
  };
}

export function hasNutrition(n: Nutrients): boolean {
  return Object.values(n).some((value) => value != null);
}

export function countNutrition(n: Nutrients): number {
  return Object.values(n).filter((value) => value != null).length;
}

/** Converte os valores "por 100 g/ml" para uma porção em gramas. */
export function scaleNutrients(per100: Nutrients, grams: number | null): Nutrients {
  if (grams == null || !Number.isFinite(grams) || grams <= 0) return { ...EMPTY_NUTRIENTS };
  const factor = grams / 100;
  const scale = (value: number | null, digits = 1) =>
    value == null ? null : round(value * factor, digits);
  return {
    kcal: scale(per100.kcal, 0),
    carbs: scale(per100.carbs),
    protein: scale(per100.protein),
    fat: scale(per100.fat),
    sat_fat: scale(per100.sat_fat),
    trans_fat: scale(per100.trans_fat),
    fiber: scale(per100.fiber),
    sugar: scale(per100.sugar),
    sodium: scale(per100.sodium, 0),
  };
}

export function buildPortion(
  per100: Nutrients,
  grams: number | null,
  label: string | null,
  basis: "100 g" | "100 ml",
): Portion {
  const unit = basis === "100 ml" ? "ml" : "g";
  const size = grams != null && grams > 0 ? round(grams, 0) : 100;
  const text = (label ?? "").trim();
  return {
    label: text || `${size} ${unit}`,
    grams: size,
    nutrients: scaleNutrients(per100, size),
  };
}

/* ------------------------------------------------- Open Food Facts (público) */

const OFF_KCAL_PER_KJ = 4.184;

/**
 * Normaliza `nutriments` do Open Food Facts (valores por 100 g/ml).
 * Sódio vem em gramas na base; convertemos para mg. Sal (g) vira sódio/2,5.
 */
export function nutrientsFromOpenFoodFacts(nutriments: Record<string, unknown>): Nutrients {
  const kcal =
    toNumber(nutriments["energy-kcal_100g"]) ??
    (toNumber(nutriments["energy_100g"]) != null
      ? toNumber(nutriments["energy_100g"])! / OFF_KCAL_PER_KJ
      : null);

  const sodiumGrams = toNumber(nutriments["sodium_100g"]);
  const saltGrams = toNumber(nutriments["salt_100g"]);
  const sodium =
    sodiumGrams != null ? sodiumGrams * 1000 : saltGrams != null ? (saltGrams * 1000) / 2.5 : null;

  return sanitizeNutrients({
    kcal: kcal ?? null,
    carbs: toNumber(nutriments["carbohydrates_100g"]),
    protein: toNumber(nutriments["proteins_100g"]),
    fat: toNumber(nutriments["fat_100g"]),
    sat_fat: toNumber(nutriments["saturated-fat_100g"]),
    trans_fat: toNumber(nutriments["trans-fat_100g"]),
    fiber: toNumber(nutriments["fiber_100g"]),
    sugar: toNumber(nutriments["sugars_100g"]),
    sodium,
  });
}

const STOPWORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "com",
  "sem",
  "e",
  "em",
  "ao",
  "a",
  "o",
  "kg",
  "g",
  "mg",
  "ml",
  "l",
  "un",
  "unidade",
  "unidades",
  "pacote",
  "caixa",
  "garrafa",
  "lata",
  "sache",
  "tipo",
  "sabor",
  "integral",
  "tradicional",
]);

export function normalizeText(text: string): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function nameTokens(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 1 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
}

/** 0..1 — quanto o nome do produto encontrado na base combina com o da foto. */
export function nameMatchScore(a: string, b: string): number {
  const left = new Set(nameTokens(a));
  const right = new Set(nameTokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  const union = new Set([...left, ...right]).size;
  const jaccard = shared / union;
  const containment = shared / Math.min(left.size, right.size);
  return round(Math.min(1, jaccard * 0.45 + containment * 0.55), 2);
}

/* ---------------------------------------------------------------- formatação */

export function fmtNumber(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtKcal(value: number | null): string {
  return value == null ? "—" : `${fmtNumber(value, 0)} kcal`;
}

export function fmtGrams(value: number | null): string {
  return value == null ? "—" : `${fmtNumber(value, 1)} g`;
}

export function fmtSodium(mg: number | null): string {
  if (mg == null) return "—";
  if (mg >= 1000) return `${fmtNumber(mg / 1000, 2)} g`;
  return `${fmtNumber(mg, 0)} mg`;
}

/** Porção em gramas/ml para exibir ("30 g", "1 fatia (50 g)"). */
export function fmtPortion(portion: Portion, basis: "100 g" | "100 ml"): string {
  if (portion.grams == null) return portion.label;
  const unit = basis === "100 ml" ? "ml" : "g";
  return `${portion.label} (${fmtNumber(portion.grams, 0)} ${unit})`;
}

/* ----------------------------------------------------------------- histórico */

export type HistoryEntry = {
  id: string;
  at: number;
  goal: NutritionGoal;
  analysis: FoodAnalysis;
};

type Store = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

export const HISTORY_LIMIT = 15;

export function historyKey(userId: string): string {
  return `compensai:calorias:historico:v1:${userId}`;
}

export function goalKey(userId: string): string {
  return `compensai:calorias:objetivo:v1:${userId}`;
}

function parseHistory(raw: string | null): HistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is HistoryEntry =>
        !!entry && typeof entry === "object" && typeof entry.id === "string" && !!entry.analysis,
    );
  } catch {
    return [];
  }
}

export function readHistory(store: Store, userId: string): HistoryEntry[] {
  return parseHistory(store.getItem(historyKey(userId)));
}

export function addHistory(
  store: Store,
  userId: string,
  entry: HistoryEntry,
  limit = HISTORY_LIMIT,
): HistoryEntry[] {
  const next = [entry, ...readHistory(store, userId).filter((item) => item.id !== entry.id)].slice(
    0,
    limit,
  );
  store.setItem(historyKey(userId), JSON.stringify(next));
  return next;
}

export function removeHistory(store: Store, userId: string, id: string): HistoryEntry[] {
  const next = readHistory(store, userId).filter((entry) => entry.id !== id);
  store.setItem(historyKey(userId), JSON.stringify(next));
  return next;
}

export function clearHistory(store: Store, userId: string): HistoryEntry[] {
  if (store.removeItem) store.removeItem(historyKey(userId));
  else store.setItem(historyKey(userId), "[]");
  return [];
}

const GOALS: NutritionGoal[] = ["lose", "maintain", "gain", "know"];

export function readGoal(store: Store, userId: string): NutritionGoal {
  const raw = store.getItem(goalKey(userId));
  return GOALS.includes(raw as NutritionGoal) ? (raw as NutritionGoal) : "know";
}

export function writeGoal(store: Store, userId: string, goal: NutritionGoal): void {
  store.setItem(goalKey(userId), goal);
}

/** Texto curto para o histórico ("R$"-free, sem foto). */
export function historySummary(entry: HistoryEntry): string {
  const kcal = entry.analysis.portion.nutrients.kcal;
  const origin = ORIGIN_LABELS[entry.analysis.origin];
  return kcal == null ? origin : `${fmtNumber(kcal, 0)} kcal por porção · ${origin}`;
}

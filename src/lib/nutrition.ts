// Domínio da seção "Calorias" (módulo puro: sem imports, testável isoladamente).
//
// Regras de produto:
//  - NUNCA inventar valores. Campo sem dado = null e a interface mostra "—".
//  - Nenhum valor nutricional nasce de "chute" da IA: ou vem do rótulo lido na
//    foto, ou de uma base/fonte consultada de verdade (com link).
//  - Toda análise carrega a ORIGEM do dado: rótulo, Open Food Facts ou uma
//    página verificada na internet. A interface precisa deixar isso explícito.
//  - A identificação do produto é independente da leitura do rótulo.
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
export type DataOrigin = "label" | "openfoodfacts" | "web" | "unknown";

export const ORIGIN_LABELS: Record<DataOrigin, string> = {
  label: "Lido do rótulo da foto",
  openfoodfacts: "Open Food Facts",
  web: "Pesquisa na internet",
  unknown: "Sem dados confiáveis",
};

export const ORIGIN_HINTS: Record<DataOrigin, string> = {
  label: "Valores transcritos da tabela nutricional que aparece na foto.",
  openfoodfacts:
    "Ficha pública deste produto no Open Food Facts. Vale conferir o rótulo da sua embalagem.",
  web: "Valores encontrados em uma página sobre este produto. O link e a fonte estão abaixo para você conferir.",
  unknown: "Nenhuma fonte confiável foi encontrada para este item.",
};

/** Quanta confiança a IA tem de que identificou o produto certo. */
export type Confidence = "high" | "medium" | "low";

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "Identificação com alta confiança",
  medium: "Identificação com confiança média",
  low: "Identificação incerta",
};

export const CONFIDENCE_HINTS: Record<Confidence, string> = {
  high: "Marca e tipo do produto bem visíveis na foto.",
  medium: "Produto reconhecido, mas marca ou versão podem variar.",
  low: "Confirme o nome e a marca antes de considerar os valores.",
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
  /** Versão/sabor detectado (ex.: "integral", "zero açúcar"). */
  variant: string | null;
  origin: DataOrigin;
  /** Confiança da identificação do produto (independente da fonte dos valores). */
  confidence: Confidence;
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
  /** Ressalva sobre a fonte (ex.: valores de outra versão do produto). */
  source_note: string | null;
  problem: string | null;
};

/* ------------------------------------------- composição (fontes em prioridade) */

/** Formato bruto que a IA devolve (antes de qualquer confiança). */
export type AiFoodPayload = {
  ok?: boolean;
  name?: string;
  brand?: string | null;
  variant?: string | null;
  category?: string | null;
  confidence?: string | null;
  /** true quando a foto mostra embalagem (ajuda a priorizar a pesquisa). */
  packaged?: boolean | null;
  barcode?: string | null;
  basis?: string | null;
  label_read?: boolean;
  label?: Partial<Nutrients> | null;
  serving_size_text?: string | null;
  serving_grams?: number | null;
  ingredients?: string | null;
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

/**
 * Fonte encontrada na internet. Só chega aqui depois de verificada no
 * backend (a URL respondeu e a página realmente mostra o valor de energia).
 */
export type WebMatch = {
  sourceName: string;
  sourceUrl: string;
  productName: string | null;
  nutrients: Nutrients;
  servingSize: string | null;
  servingGrams: number | null;
  ingredients: string | null;
};

export type AnalysisSources = {
  off?: OffMatch | null;
  web?: WebMatch | null;
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
const CONFIDENCE_VALUES: Confidence[] = ["high", "medium", "low"];

function clampPortion(value: unknown): number | null {
  const grams = toNumber(value);
  if (grams == null || grams <= 0) return null;
  return Math.min(Math.max(grams, 1), 5000);
}

/** Frase curta por objetivo, usada no motivo do veredito. */
function goalFocus(goal: NutritionGoal): string {
  if (goal === "lose") return "emagrecer com saúde";
  if (goal === "gain") return "ganhar massa muscular";
  if (goal === "maintain") return "manter o peso";
  return "conhecer os valores";
}

/**
 * Veredito determinístico a partir dos números — sem IA opinando sobre
 * nutrientes que ela não viu. Assim o motivo sempre bate com a tabela.
 */
export function evaluateFit(
  per100: Nutrients,
  goal: NutritionGoal,
): { verdict: FitVerdict; reason: string } {
  if (!hasNutrition(per100)) {
    return {
      verdict: "balanced",
      reason: "Sem valores nutricionais confiáveis não há como avaliar o encaixe no seu objetivo.",
    };
  }

  const positives: string[] = [];
  const negatives: string[] = [];
  const { kcal, fiber, protein, sugar, sat_fat, sodium, trans_fat } = per100;

  if (fiber != null && fiber >= 3) positives.push(`${fmtNumber(fiber)} g de fibras por 100 g`);
  if (protein != null && protein >= 10)
    positives.push(`${fmtNumber(protein)} g de proteína por 100 g`);
  if (kcal != null && kcal <= 120) positives.push(`${fmtNumber(kcal, 0)} kcal por 100 g`);
  if (sugar != null && sugar <= 5) positives.push(`pouco açúcar (${fmtNumber(sugar)} g)`);
  if (sat_fat != null && sat_fat <= 1.5)
    positives.push(`pouca gordura saturada (${fmtNumber(sat_fat)} g)`);
  if (sodium != null && sodium <= 120) positives.push(`pouco sódio (${fmtSodium(sodium)})`);

  if (sugar != null && sugar > 15) negatives.push(`${fmtNumber(sugar)} g de açúcares por 100 g`);
  if (sat_fat != null && sat_fat > 5)
    negatives.push(`${fmtNumber(sat_fat)} g de gordura saturada por 100 g`);
  if (sodium != null && sodium > 600) negatives.push(`${fmtSodium(sodium)} de sódio por 100 g`);
  if (trans_fat != null && trans_fat > 0) negatives.push("gordura trans na composição");
  if (kcal != null && kcal >= 400) negatives.push(`${fmtNumber(kcal, 0)} kcal por 100 g`);

  if (goal === "know") {
    const profile = [...positives.slice(0, 2), ...negatives.slice(0, 2)].join(", ");
    return {
      verdict: "balanced",
      reason: profile
        ? `Perfil nutricional: ${profile}.`
        : "Sem pontos extremos nos valores disponíveis.",
    };
  }

  let verdict: FitVerdict;
  if (negatives.length >= 2 && positives.length === 0) verdict = "alternative";
  else if (negatives.length >= 1) verdict = "moderation";
  else if (positives.length >= 2) verdict = "good";
  else if (goal === "gain" && protein != null && protein >= 10) verdict = "good";
  else if (goal === "lose" && fiber != null && fiber >= 3) verdict = "good";
  else verdict = "balanced";

  const positive = positives.slice(0, 2).join(" e ");
  const negative = negatives.slice(0, 2).join(" e ");
  const focus = goalFocus(goal);

  let reason: string;
  if (verdict === "good") {
    reason = `Para ${focus}, os números ajudam${positive ? `: ${positive}` : ""}.`;
  } else if (verdict === "moderation") {
    reason = `Vale moderar a frequência ou a porção${negative ? `: ${negative}` : ""}.${
      positive ? ` Em compensação, tem ${positive}.` : ""
    }`;
  } else if (verdict === "alternative") {
    reason = `Pouco alinhado a ${focus}${negative ? `: ${negative}` : ""}.`;
  } else {
    reason = `Perfil intermediário${positive ? `: ${positive}` : ""}${
      negative ? `, com atenção para ${negative}` : ""
    }.`;
  }

  return { verdict, reason };
}

/** Pontos positivos derivados dos números (nunca afirmações inventadas). */
export function deriveBenefits(per100: Nutrients): string[] {
  const out: string[] = [];
  const { kcal, fiber, protein, sugar, sat_fat, sodium } = per100;
  if (fiber != null && fiber >= 3) out.push(`Fonte de fibras: ${fmtNumber(fiber)} g por 100 g.`);
  if (protein != null && protein >= 10)
    out.push(`Proteína relevante: ${fmtNumber(protein)} g por 100 g.`);
  if (kcal != null && kcal <= 120)
    out.push(`Baixa densidade calórica: ${fmtNumber(kcal, 0)} kcal por 100 g.`);
  if (sugar != null && sugar <= 5) out.push(`Pouco açúcar: ${fmtNumber(sugar)} g por 100 g.`);
  if (sat_fat != null && sat_fat <= 1.5)
    out.push(`Pouca gordura saturada: ${fmtNumber(sat_fat)} g por 100 g.`);
  if (sodium != null && sodium <= 120) out.push(`Pouco sódio: ${fmtSodium(sodium)} por 100 g.`);
  return out.slice(0, 4);
}

/** Pontos de atenção derivados dos números. */
export function deriveCautions(per100: Nutrients): string[] {
  const out: string[] = [];
  const { kcal, sugar, sat_fat, sodium, trans_fat } = per100;
  if (sugar != null && sugar > 15) out.push(`Açúcares: ${fmtNumber(sugar)} g por 100 g.`);
  if (sat_fat != null && sat_fat > 5)
    out.push(`Gordura saturada: ${fmtNumber(sat_fat)} g por 100 g.`);
  if (trans_fat != null && trans_fat > 0)
    out.push(`Gordura trans: ${fmtNumber(trans_fat)} g por 100 g.`);
  if (sodium != null && sodium > 600) out.push(`Sódio: ${fmtSodium(sodium)} por 100 g.`);
  if (kcal != null && kcal >= 400)
    out.push(`Alta densidade calórica: ${fmtNumber(kcal, 0)} kcal por 100 g.`);
  return out.slice(0, 4);
}

function confidenceFrom(value: unknown): Confidence {
  return CONFIDENCE_VALUES.includes(value as Confidence) ? (value as Confidence) : "medium";
}

/**
 * Monta a análise final respeitando a prioridade das fontes:
 * rótulo lido na foto > Open Food Facts > página verificada na internet.
 * Sem nenhuma delas não existe valor: a resposta fica "unknown".
 * Nunca mistura fontes dentro do mesmo conjunto de valores.
 */
export function composeAnalysis(
  payload: AiFoodPayload,
  sources: AnalysisSources,
  goal: NutritionGoal,
): FoodAnalysis {
  const name = cleanText(payload.name, 90) ?? "";
  const confidence = confidenceFrom(payload.confidence);
  const off = sources.off ?? null;
  const web = sources.web ?? null;

  if (payload.ok === false || !name) {
    return unknownAnalysis(
      cleanText(payload.problem, 200) ??
        "Não consegui identificar o produto com segurança. Tente outra foto ou informe o nome e a marca.",
      name || null,
      goal,
    );
  }

  const basis: "100 g" | "100 ml" = payload.basis === "100 ml" ? "100 ml" : "100 g";
  const label = sanitizeNutrients(payload.label ?? {});
  const labelOk = payload.label_read === true && hasNutrition(label);

  let origin: DataOrigin = "unknown";
  let per100: Nutrients = { ...EMPTY_NUTRIENTS };
  let sourceName: string | null = null;
  let sourceUrl: string | null = null;
  let sourceNote: string | null = null;
  let ingredients = cleanText(payload.ingredients, 600);
  let sourceServingSize: string | null = null;
  let sourceServingGrams: number | null = null;

  if (labelOk) {
    origin = "label";
    per100 = label;
    sourceName = "Tabela nutricional da própria embalagem";
  } else if (off && hasNutrition(off.nutrients)) {
    origin = "openfoodfacts";
    per100 = off.nutrients;
    sourceName = `${off.name ?? "Open Food Facts"}${off.brands ? ` · ${off.brands}` : ""}`.slice(
      0,
      120,
    );
    sourceUrl = off.code
      ? `https://world.openfoodfacts.org/product/${off.code}`
      : "https://world.openfoodfacts.org";
    sourceServingSize = cleanText(off.servingSize, 40);
    sourceServingGrams = clampPortion(off.servingQuantity);
    ingredients = ingredients ?? cleanText(off.ingredients, 600);
    if (off.name && nameMatchScore(name, off.name) < 0.6) {
      sourceNote = `A ficha encontrada é de “${off.name}”. Confirme se é a mesma versão do produto.`;
    }
  } else if (web && hasNutrition(web.nutrients)) {
    origin = "web";
    per100 = web.nutrients;
    sourceName = cleanText(web.sourceName, 80) ?? "Página na internet";
    sourceUrl = web.sourceUrl;
    sourceServingSize = cleanText(web.servingSize, 40);
    sourceServingGrams = clampPortion(web.servingGrams);
    ingredients = ingredients ?? cleanText(web.ingredients, 600);
    if (web.productName && nameMatchScore(name, web.productName) < 0.6) {
      sourceNote = `A fonte descreve “${web.productName}”. Os valores podem ser de outra versão.`;
    }
  }

  const aiGrams = clampPortion(payload.serving_grams);
  const servingGrams = aiGrams ?? sourceServingGrams;
  const servingLabel = aiGrams
    ? (cleanText(payload.serving_size_text, 40) ?? sourceServingSize)
    : (sourceServingSize ?? cleanText(payload.serving_size_text, 40));
  const portion = buildPortion(per100, servingGrams, servingLabel, basis);

  const fit = evaluateFit(per100, goal);

  return {
    ok: true,
    name,
    brand: cleanText(payload.brand, 60),
    category: cleanText(payload.category, 50),
    variant: cleanText(payload.variant, 40),
    origin,
    confidence,
    goal,
    basis,
    per100,
    portion,
    ingredients,
    benefits: deriveBenefits(per100),
    cautions: deriveCautions(per100),
    fit: {
      verdict: VERDICT_VALUES.includes(fit.verdict) ? fit.verdict : "balanced",
      reason: fit.reason,
    },
    better_choices: cleanSuggestions(payload.better_choices),
    balance_tips: cleanList(payload.balance_tips, 4),
    source_name: sourceName,
    source_url: sourceUrl,
    source_note: sourceNote,
    problem:
      origin === "unknown"
        ? (cleanText(payload.problem, 200) ??
          "Encontrei o produto, mas não achei uma fonte confiável com os valores nutricionais dele. " +
            "Você pode tentar outra foto do rótulo ou pesquisar pelo nome e marca.")
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
    variant: null,
    origin: "unknown",
    confidence: "low",
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
    source_note: null,
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

/* ------------------------------------------------- verificação de fonte web */

/** Texto visível da página (sem scripts/estilos/tags), em minúsculas. */
export function pageToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * O número de kcal aparece perto de uma menção de energia/calorias?
 * Para 0 kcal exigimos "0 kcal" explícito — nunca aceitamos zero por omissão.
 */
export function textConfirmsEnergy(text: string, kcal: number | null): boolean {
  if (!text) return false;
  const markers = /(kcal|calorias|energia|kj|quilojoule)/;

  if (kcal == null) return markers.test(text);
  if (kcal === 0) return /\b0\s*(kcal|calorias)\b/.test(text);

  const variants = new Set<string>([String(Math.round(kcal))]);
  variants.add(`${Math.round(kcal)},0`);
  variants.add(`${Math.round(kcal)}.0`);

  for (const variant of variants) {
    let from = 0;
    for (;;) {
      const index = text.indexOf(variant, from);
      if (index < 0) break;
      const window = text.slice(Math.max(0, index - 160), index + 160);
      if (markers.test(window)) return true;
      from = index + variant.length;
    }
  }
  return false;
}

/** A página cita pelo menos um token relevante do nome do produto? */
export function sourceMentionsProduct(text: string, productName: string): boolean {
  const tokens = nameTokens(productName)
    .filter((token) => token.length > 2)
    .slice(0, 4);
  if (tokens.length === 0) return true;
  return tokens.some((token) => text.includes(token));
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

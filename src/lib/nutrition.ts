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
  /** Açúcares totais. */
  sugar: number | null;
  /** Açúcares adicionados (rótulo brasileiro separa de "açúcares totais"). */
  added_sugar: number | null;
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
  added_sugar: null,
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

/**
 * Alternativa sugerida para a próxima compra.
 *
 * `name` e `why` vêm da IA (texto, sem números). Os campos opcionais só
 * aparecem quando o servidor confirmou os dados em uma fonte de verdade:
 * a marca é a da ficha encontrada, `per100` vem da base/fonte verificada e
 * `compare` é calculado comparando os números reais das duas fichas.
 * Sem fonte confiável, esses campos ficam ausentes — nunca preenchidos "no
 * chute" pela IA.
 */
export type FoodSuggestion = {
  name: string;
  why: string;
  /** Marca confirmada na fonte (nunca inventada). */
  brand?: string | null;
  /** Código de barras confirmado na fonte, quando existir. */
  barcode?: string | null;
  /** Frase qualitativa da IA (sem números) ou comparação numérica calculada. */
  compare?: string | null;
  /** Valores por 100 g/ml da alternativa, quando a fonte foi encontrada. */
  per100?: Nutrients | null;
  basis?: "100 g" | "100 ml";
  source_name?: string | null;
  source_url?: string | null;
};

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
  /** Alergênicos declarados no rótulo/fonte. null = não informado. */
  allergens: string | null;
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
  /** Pode vir como texto ("contém leite") ou lista (["leite","soja"]). */
  allergens?: unknown;
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
  allergens: string | null;
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
  allergens: string | null;
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

/**
 * Texto seguro para dados que chegam de fora (IA, Open Food Facts, JSON).
 *
 * Diferente de `cleanText`, aceita os formatos que já apareceram na prática:
 *  - string: usa como está;
 *  - número finito: vira o próprio número em texto (código de barras, porção);
 *  - array de primitivos: itens convertidos e unidos por vírgula (marcas,
 *    alergênicos e ingredientes às vezes vêm como lista);
 *  - objeto/booleano/null/undefined: `null` (nunca "[object Object]").
 *
 * É a porta de entrada de tudo que depois passa por `normalizeText`.
 */
export function textOf(value: unknown, max = 200): string | null {
  if (typeof value === "string") return cleanText(value, max);
  if (typeof value === "number") {
    return Number.isFinite(value) ? cleanText(String(value), max) : null;
  }
  if (typeof value === "bigint") return cleanText(String(value), max);
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "number") return Number.isFinite(item) ? String(item) : null;
        if (typeof item === "bigint") return String(item);
        return null;
      })
      .filter((item): item is string => !!item && item.trim().length > 0);
    if (parts.length === 0) return null;
    return cleanText(parts.join(", "), max);
  }
  return null;
}

export function cleanList(value: unknown, max = 4, maxLen = 220): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxLen))
    .filter((item): item is string => !!item)
    .slice(0, max);
}

const SUGGESTION_BASIS: ("100 g" | "100 ml")[] = ["100 g", "100 ml"];

/**
 * Normaliza as alternativas vindas da IA. Só nome e motivo são obrigatórios;
 * os campos de fonte/valores entram apenas quando existem e passam pelo
 * saneamento — a IA não consegue "plantar" nutrientes aqui.
 */
export function cleanSuggestions(value: unknown): FoodSuggestion[] {
  if (!Array.isArray(value)) return [];
  const out: FoodSuggestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as FoodSuggestion;
    const name = cleanText(raw.name, 80);
    const why = cleanText(raw.why, 160);
    if (!name || !why) continue;
    const suggestion: FoodSuggestion = { name, why };
    const brand = cleanText(raw.brand, 60);
    if (brand) suggestion.brand = brand;
    const barcode = textOf(raw.barcode, 32);
    if (barcode) suggestion.barcode = barcode;
    const compare = cleanText(raw.compare, 180);
    if (compare) suggestion.compare = compare;
    if (raw.per100 && typeof raw.per100 === "object") {
      const per100 = sanitizeNutrients(raw.per100);
      if (hasNutrition(per100)) {
        suggestion.per100 = per100;
        suggestion.basis = SUGGESTION_BASIS.includes(raw.basis as "100 g" | "100 ml")
          ? (raw.basis as "100 g" | "100 ml")
          : "100 g";
      }
    }
    const sourceName = cleanText(raw.source_name, 80);
    if (sourceName) suggestion.source_name = sourceName;
    const sourceUrl = cleanText(raw.source_url, 500);
    if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) suggestion.source_url = sourceUrl;
    out.push(suggestion);
    if (out.length >= 3) break;
  }
  return out;
}

/* ------------------------------------------ recomendações personalizadas */

/** Foco de cada objetivo, usado no contexto enviado à IA e nos testes. */
export const SUGGESTION_FOCUS: Record<NutritionGoal, string> = {
  lose: "mais fibras, mais saciedade e menos açúcar",
  gain: "mais proteína por porção e energia de qualidade",
  maintain: "equilíbrio entre nutrientes, sem extremos",
  know: "variedade e informação, sem julgamento",
};

/** Contexto que o usuário informa na tela (nada é presumido). */
export type RecommendationContext = {
  goal: NutritionGoal;
  preferences?: string | null;
  restrictions?: string | null;
  listItems?: unknown;
};

/** Nome de um item de lista em qualquer formato aceitável. */
function listNameOf(value: unknown): string | null {
  if (typeof value === "string") return cleanText(value, 80);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return textOf((value as { name?: unknown }).name, 80);
  }
  return null;
}

/** Nomes da lista de compras (aceita lista, texto separado por vírgula etc.). */
export function cleanListNames(value: unknown, max = 12): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[;,\n]/) : [];
  const out: string[] = [];
  for (const item of raw) {
    const name = listNameOf(item);
    if (!name) continue;
    const key = normalizeText(name);
    if (!key || out.some((prev) => normalizeText(prev) === key)) continue;
    out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Texto de contexto anexado ao prompt. Função pura: o que a IA recebe é
 * exatamente o que está aqui — objetivo, preferências/restrições escritas pelo
 * usuário e o que já está na lista.
 */
export function buildRecommendationContext(context: RecommendationContext): string {
  const goal = context.goal ?? "know";
  const preferences = cleanText(context.preferences, 160);
  const restrictions = cleanText(context.restrictions, 160);
  const items = cleanListNames(context.listItems);

  const lines = [
    "CONTEXTO DO USUÁRIO (use para personalizar as alternativas):",
    `- Objetivo alimentar: ${goalLabel(goal)} (foco: ${SUGGESTION_FOCUS[goal]}).`,
  ];

  if (goal === "know") {
    lines.push(
      "- O usuário NÃO definiu objetivo alimentar: dê sugestões gerais de variedade e não afirme que são personalizadas.",
    );
  }
  lines.push(
    preferences
      ? `- Preferências alimentares informadas por ele: ${preferences}.`
      : "- Preferências alimentares: não informadas — não presuma nenhuma.",
  );
  lines.push(
    restrictions
      ? `- Restrições/alergias informadas por ele: ${restrictions}. Evite sugerir itens que as contrariem.`
      : "- Restrições/alergias: não informadas — não presuma nenhuma condição médica.",
  );
  lines.push(
    items.length > 0
      ? `- Já estão na lista de compras dele: ${items.join(", ")}. Evite repetir esses itens.`
      : "- Lista de compras: vazia ou indisponível.",
  );
  lines.push(
    "- As alternativas precisam ser alimentos/produtos comuns de supermercado, coerentes com esse contexto.",
    "- Nunca cite marcas que você não consegue confirmar e nunca escreva números nutricionais nesta etapa.",
  );
  return lines.join("\n");
}

/**
 * Remove alternativas que o usuário já tem na lista (ou repetidas entre si).
 * Evita recomendação redundante sem esconder demais: no máximo 3 ficam.
 */
export function filterSuggestions(
  suggestions: FoodSuggestion[],
  listItems: unknown,
  limit = 3,
): FoodSuggestion[] {
  const names = cleanListNames(listItems);
  const kept: FoodSuggestion[] = [];
  for (const suggestion of suggestions) {
    if (names.some((name) => isSameProductName(suggestion.name, name))) continue;
    if (kept.some((item) => isSameProductName(item.name, suggestion.name))) continue;
    kept.push(suggestion);
    if (kept.length >= limit) break;
  }
  return kept;
}

/** Nomes que descrevem o mesmo item de compra (para não duplicar). */
export function isSameProductName(a: unknown, b: unknown): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 4 && right.includes(left)) return true;
  if (right.length >= 4 && left.includes(right)) return true;
  return nameMatchScore(left, right) >= 0.6;
}

const COMPARE_ORDER: Record<NutritionGoal, (keyof Nutrients)[]> = {
  lose: ["fiber", "sugar", "sat_fat", "protein", "sodium"],
  gain: ["protein", "fiber", "sugar", "sat_fat"],
  maintain: ["fiber", "sat_fat", "sugar", "protein"],
  know: ["fiber", "protein", "sugar", "sat_fat"],
};

const COMPARE_LABEL: Partial<Record<keyof Nutrients, string>> = {
  fiber: "fibras",
  protein: "proteína",
  sugar: "açúcares",
  sat_fat: "gordura saturada",
  sodium: "sódio",
};

const COMPARE_BETTER: Partial<Record<keyof Nutrients, "more" | "less">> = {
  fiber: "more",
  protein: "more",
  sugar: "less",
  sat_fat: "less",
  sodium: "less",
};

/**
 * Comparação determinística entre o produto analisado e a alternativa, usando
 * apenas números de fontes confirmadas. Sem vantagem numérica comprovada,
 * devolve `null` (a interface não inventa elogio).
 */
export function compareSuggestion(
  reference: unknown,
  alternative: unknown,
  goal: NutritionGoal = "know",
): string | null {
  const ref = sanitizeNutrients(reference);
  const alt = sanitizeNutrients(alternative);
  if (!hasNutrition(alt) || !hasNutrition(ref)) return null;

  const parts: string[] = [];
  for (const key of COMPARE_ORDER[goal] ?? COMPARE_ORDER.know) {
    if (parts.length >= 2) break;
    const label = COMPARE_LABEL[key];
    const direction = COMPARE_BETTER[key];
    const altValue = alt[key];
    const refValue = ref[key];
    if (!label || !direction || altValue == null || refValue == null) continue;
    const better = direction === "more" ? altValue > refValue : altValue < refValue;
    if (!better) continue;
    const format = (value: number) =>
      key === "sodium" ? fmtSodium(value) : `${fmtNumber(value)} g`;
    parts.push(`${format(altValue)} de ${label} (o analisado tem ${format(refValue)})`);
  }

  if (parts.length === 0) return null;
  return `Por 100 g, tem ${parts.join(" e ")}.`;
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
  let ingredients = textOf(payload.ingredients, 600);
  let allergens = textOf(payload.allergens, 300);
  let sourceServingSize: string | null = null;
  let sourceServingGrams: number | null = null;

  if (labelOk) {
    origin = "label";
    per100 = label;
    sourceName = "Tabela nutricional da própria embalagem";
  } else if (off && hasNutrition(off.nutrients)) {
    origin = "openfoodfacts";
    per100 = off.nutrients;
    const offTitle = textOf(off.name, 120) ?? "Open Food Facts";
    const offBrands = textOf(off.brands, 60);
    sourceName = (offBrands ? `${offTitle} · ${offBrands}` : offTitle).slice(0, 120);
    const offCode = textOf(off.code, 30);
    sourceUrl = offCode
      ? `https://world.openfoodfacts.org/product/${encodeURIComponent(offCode)}`
      : "https://world.openfoodfacts.org";
    sourceServingSize = textOf(off.servingSize, 40);
    sourceServingGrams = clampPortion(off.servingQuantity);
    ingredients = ingredients ?? textOf(off.ingredients, 600);
    allergens = allergens ?? textOf(off.allergens, 300);
    if (off.name && nameMatchScore(name, off.name) < 0.6) {
      sourceNote = `A ficha encontrada é de “${offTitle}”. Confirme se é a mesma versão do produto.`;
    }
  } else if (web && hasNutrition(web.nutrients)) {
    origin = "web";
    per100 = web.nutrients;
    sourceName = textOf(web.sourceName, 80) ?? "Página na internet";
    sourceUrl = textOf(web.sourceUrl, 500);
    sourceServingSize = textOf(web.servingSize, 40);
    sourceServingGrams = clampPortion(web.servingGrams);
    ingredients = ingredients ?? textOf(web.ingredients, 600);
    allergens = allergens ?? textOf(web.allergens, 300);
    const webName = textOf(web.productName, 120);
    if (webName && nameMatchScore(name, webName) < 0.6) {
      sourceNote = `A fonte descreve “${webName}”. Os valores podem ser de outra versão.`;
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
    allergens,
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
    allergens: null,
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
export function sanitizeNutrients(input: unknown): Nutrients {
  const source = (input && typeof input === "object" ? input : {}) as Partial<Nutrients>;
  return {
    kcal: sane(toNumber(source.kcal), 900, 0),
    carbs: sane(toNumber(source.carbs), 100),
    protein: sane(toNumber(source.protein), 100),
    fat: sane(toNumber(source.fat), 100),
    sat_fat: sane(toNumber(source.sat_fat), 100),
    trans_fat: sane(toNumber(source.trans_fat), 100),
    fiber: sane(toNumber(source.fiber), 100),
    sugar: sane(toNumber(source.sugar), 100),
    added_sugar: sane(toNumber(source.added_sugar), 100),
    sodium: sane(toNumber(source.sodium), 20000, 0),
  };
}

export function hasNutrition(n: unknown): boolean {
  if (!n || typeof n !== "object") return false;
  return Object.values(n as Nutrients).some((value) => value != null);
}

export function countNutrition(n: unknown): number {
  if (!n || typeof n !== "object") return 0;
  return Object.values(n as Nutrients).filter((value) => value != null).length;
}

/** Converte os valores "por 100 g/ml" para uma porção em gramas. */
export function scaleNutrients(per100: unknown, grams: unknown): Nutrients {
  const source = (per100 && typeof per100 === "object" ? per100 : EMPTY_NUTRIENTS) as Nutrients;
  const size = toNumber(grams);
  if (size == null || size <= 0) return { ...EMPTY_NUTRIENTS };
  const factor = size / 100;
  const scale = (value: number | null, digits = 1) =>
    value == null || !Number.isFinite(value) ? null : round(value * factor, digits);
  return {
    kcal: scale(source.kcal, 0),
    carbs: scale(source.carbs),
    protein: scale(source.protein),
    fat: scale(source.fat),
    sat_fat: scale(source.sat_fat),
    trans_fat: scale(source.trans_fat),
    fiber: scale(source.fiber),
    sugar: scale(source.sugar),
    added_sugar: scale(source.added_sugar),
    sodium: scale(source.sodium, 0),
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
  const text = textOf(label, 60) ?? "";
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
 * Aceita entrada desconhecida: a API pública às vezes devolve lista, texto ou
 * campos ausentes — nesse caso o resultado é "sem dados", nunca uma exceção.
 * Sódio vem em gramas na base; convertemos para mg. Sal (g) vira sódio/2,5.
 */
export function nutrientsFromOpenFoodFacts(nutriments: unknown): Nutrients {
  const source = (nutriments && typeof nutriments === "object" ? nutriments : {}) as Record<
    string,
    unknown
  >;
  const kcal =
    toNumber(source["energy-kcal_100g"]) ??
    (toNumber(source["energy_100g"]) != null
      ? toNumber(source["energy_100g"])! / OFF_KCAL_PER_KJ
      : null);

  const sodiumGrams = toNumber(source["sodium_100g"]);
  const saltGrams = toNumber(source["salt_100g"]);
  const sodium =
    sodiumGrams != null ? sodiumGrams * 1000 : saltGrams != null ? (saltGrams * 1000) / 2.5 : null;

  return sanitizeNutrients({
    kcal: kcal ?? null,
    carbs: toNumber(source["carbohydrates_100g"]),
    protein: toNumber(source["proteins_100g"]),
    fat: toNumber(source["fat_100g"]),
    sat_fat: toNumber(source["saturated-fat_100g"]),
    trans_fat: toNumber(source["trans-fat_100g"]),
    fiber: toNumber(source["fiber_100g"]),
    sugar: toNumber(source["sugars_100g"]),
    added_sugar: toNumber(source["added-sugars_100g"]),
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

/**
 * Normaliza texto para comparação (sem acento, minúsculo, só letras/números).
 *
 * Recebe `unknown` de propósito: este é o ponto que quebrava com
 * `(text ?? "").normalize is not a function` quando a IA/OFF devolvia número,
 * objeto ou lista. Aqui nada lança: valor não textual vira "" (ou o próprio
 * número, quando faz sentido, ex.: código de barras).
 */
export function normalizeText(text: unknown): string {
  return (textOf(text, 5000) ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function nameTokens(text: unknown): string[] {
  return normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 1 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
}

/** 0..1 — quanto o nome do produto encontrado na base combina com o da foto. */
export function nameMatchScore(a: unknown, b: unknown): number {
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
export function pageToText(html: unknown): string {
  if (typeof html !== "string" || !html) return "";
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
export function textConfirmsEnergy(text: unknown, kcal: unknown): boolean {
  if (typeof text !== "string" || !text) return false;
  const markers = /(kcal|calorias|energia|kj|quilojoule)/;

  const value = typeof kcal === "number" && Number.isFinite(kcal) ? kcal : null;
  if (value == null) return markers.test(text);
  if (value === 0) return /\b0\s*(kcal|calorias)\b/.test(text);

  const variants = new Set<string>([String(Math.round(value))]);
  variants.add(`${Math.round(value)},0`);
  variants.add(`${Math.round(value)}.0`);

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
export function sourceMentionsProduct(text: unknown, productName: unknown): boolean {
  const haystack = typeof text === "string" ? text.toLowerCase() : "";
  if (!haystack) return false;
  const tokens = nameTokens(productName)
    .filter((token) => token.length > 2)
    .slice(0, 4);
  if (tokens.length === 0) return true;
  return tokens.some((token) => haystack.includes(token));
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

/* ------------------------------------- preferências/restrições (local, opcional) */

export type StoredPreferences = {
  preferences: string;
  restrictions: string;
};

export function preferencesKey(userId: string): string {
  return `compensai:calorias:preferencias:v1:${userId}`;
}

/**
 * Preferências e restrições ficam só no aparelho do usuário (como o objetivo):
 * nada de dado sensível indo para o banco sem ele pedir.
 */
export function readPreferences(store: Store, userId: string): StoredPreferences {
  const empty: StoredPreferences = { preferences: "", restrictions: "" };
  const raw = store.getItem(preferencesKey(userId));
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPreferences>;
    return {
      preferences: cleanText(parsed?.preferences, 160) ?? "",
      restrictions: cleanText(parsed?.restrictions, 160) ?? "",
    };
  } catch {
    return empty;
  }
}

export function writePreferences(
  store: Store,
  userId: string,
  value: StoredPreferences,
): StoredPreferences {
  const clean: StoredPreferences = {
    preferences: cleanText(value.preferences, 160) ?? "",
    restrictions: cleanText(value.restrictions, 160) ?? "",
  };
  if (!clean.preferences && !clean.restrictions) store.setItem(preferencesKey(userId), "{}");
  else store.setItem(preferencesKey(userId), JSON.stringify(clean));
  return clean;
}

/* ------------------------------- ponte com a lista de compras (dados do item) */
//
// Tudo aqui é puro: decide QUAIS dados da análise podem entrar na lista e como
// gravar sem quebrar registros antigos.
//
// Regras:
//  - Nome é obrigatório; sem nome não existe item.
//  - Preço só existe quando alguém informou um preço de verdade (nunca é
//    estimado); sem preço fica 0 — o mesmo "não informado" já usado na lista.
//  - Marca, código de barras, embalagem, nutrientes e fonte só entram quando
//    vieram de uma fonte confirmada (a IA não preenche esses campos).
//  - A tabela só aceita as colunas de nutrição depois da migração; se o banco
//    ainda não as tiver, gravamos o subconjunto antigo.

/** Valores por 100 g/ml guardados junto do item da lista. */
export type ListItemNutrition = {
  basis: "100 g" | "100 ml";
  per100: Nutrients;
  /** De onde vieram os valores (nunca "chute"): OFF, fonte web ou rótulo. */
  source_name: string | null;
  source_url: string | null;
};

export type ListItemPayload = {
  name: string;
  brand: string | null;
  quantity: number;
  unit: string;
  /** 0 = preço não informado (comportamento histórico da lista). */
  price: number;
  reference_price: number | null;
  package_size: number | null;
  package_unit: string | null;
  barcode: string | null;
  nutrition: ListItemNutrition | null;
};

/** Entrada solta: a lista recebe dados da voz, do comparador e do Calorias. */
export type ListItemInput = {
  name?: unknown;
  brand?: unknown;
  quantity?: unknown;
  unit?: unknown;
  price?: unknown;
  reference_price?: unknown;
  package_size?: unknown;
  package_unit?: unknown;
  barcode?: unknown;
  nutrition?: unknown;
};

/** Colunas que existem na tabela desde o começo. */
export const LIST_ITEM_BASE_KEYS = [
  "name",
  "brand",
  "quantity",
  "unit",
  "price",
  "reference_price",
  "package_size",
  "package_unit",
] as const;

/** Colunas criadas pela migração opcional de nutrição. */
export const LIST_ITEM_EXTENDED_KEYS = ["barcode", "nutrition"] as const;

export type ListItemBaseRow = Pick<ListItemPayload, (typeof LIST_ITEM_BASE_KEYS)[number]>;
export type ListItemExtraRow = { barcode: string | null; nutrition: ListItemNutrition | null };

type BuildListItemOptions = {
  /** Preço unitário já conhecido e confirmado (nunca estimado). */
  price?: unknown;
  quantity?: unknown;
  unit?: unknown;
  packageSize?: unknown;
  packageUnit?: unknown;
};

function positiveNumber(value: unknown, max = 1_000_000): number | null {
  const parsed = toNumber(value);
  if (parsed == null || !Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(parsed, max);
}

function cleanNutrition(value: unknown): ListItemNutrition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<ListItemNutrition>;
  const per100 = sanitizeNutrients(raw.per100);
  if (!hasNutrition(per100)) return null;
  return {
    basis: raw.basis === "100 ml" ? "100 ml" : "100 g",
    per100,
    source_name: cleanText(raw.source_name, 80),
    source_url: cleanText(raw.source_url, 500),
  };
}

/**
 * Monta o item da lista a partir de uma alternativa recomendada.
 * `analysis` é o produto analisado: dele aproveitamos apenas a base (100 g/ml)
 * para a alternativa que veio sem valores.
 */
export function buildListItemPayload(
  suggestion: FoodSuggestion | null | undefined,
  analysis?: FoodAnalysis | null,
  options: BuildListItemOptions = {},
): ListItemPayload | null {
  const name = cleanText(suggestion?.name, 90);
  if (!name) return null;

  const basis: "100 g" | "100 ml" =
    suggestion?.basis === "100 ml" || (!suggestion?.per100 && analysis?.basis === "100 ml")
      ? "100 ml"
      : "100 g";

  const per100 = suggestion?.per100 ? sanitizeNutrients(suggestion.per100) : null;
  const nutrition: ListItemNutrition | null =
    per100 && hasNutrition(per100)
      ? {
          basis,
          per100,
          source_name: cleanText(suggestion?.source_name, 80),
          source_url: cleanText(suggestion?.source_url, 500),
        }
      : null;

  return {
    name,
    brand: cleanText(suggestion?.brand, 60),
    quantity: positiveNumber(options.quantity, 9999) ?? 1,
    unit: cleanText(options.unit, 12) ?? "un",
    price: positiveNumber(options.price) ?? 0,
    reference_price: null,
    package_size: positiveNumber(options.packageSize, 100_000),
    package_unit: cleanText(options.packageUnit, 12),
    barcode: textOf(suggestion?.barcode, 32),
    nutrition,
  };
}

/** Normaliza entrada solta (voz, comparador, Calorias) para a linha da tabela. */
export function normalizeListItemInput(input: ListItemInput): ListItemPayload | null {
  const name = cleanText(input.name, 120);
  if (!name) return null;

  return {
    name,
    brand: cleanText(input.brand, 60),
    quantity: positiveNumber(input.quantity, 9999) ?? 1,
    unit: cleanText(input.unit, 12) ?? "un",
    price: positiveNumber(input.price) ?? 0,
    reference_price: positiveNumber(input.reference_price),
    package_size: positiveNumber(input.package_size, 100_000),
    package_unit: cleanText(input.package_unit, 12),
    barcode: textOf(input.barcode, 32),
    nutrition: cleanNutrition(input.nutrition),
  };
}

/** Subconjunto seguro para bancos que ainda não receberam a migração. */
export function baseListItemPayload(payload: ListItemPayload): ListItemBaseRow {
  return {
    name: payload.name,
    brand: payload.brand,
    quantity: payload.quantity,
    unit: payload.unit,
    price: payload.price,
    reference_price: payload.reference_price,
    package_size: payload.package_size,
    package_unit: payload.package_unit,
  };
}

/** Dados que só podem ser gravados depois da migração. */
export function extendedListItemPayload(payload: ListItemPayload): ListItemExtraRow {
  return { barcode: payload.barcode, nutrition: payload.nutrition };
}

/** Existe algo além do que o banco antigo aceita? */
export function hasExtendedData(payload: ListItemPayload): boolean {
  return payload.barcode != null || payload.nutrition != null;
}

/** Linha completa (base + colunas novas). */
export function fullListItemPayload(payload: ListItemPayload): ListItemBaseRow & ListItemExtraRow {
  return { ...baseListItemPayload(payload), ...extendedListItemPayload(payload) };
}

/**
 * O erro diz que a coluna nova não existe (migração ainda não aplicada)?
 * Cobre PostgREST (`42703`, `PGRST204`) e mensagens em texto.
 */
export function needsColumnFallback(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  if (code === "42703" || code === "PGRST204") return true;
  const text = [candidate.message, candidate.details]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();
  if (!text) return false;
  return (
    /column .* does not exist/.test(text) ||
    /could not find the ['"][^'"]+['"] column/.test(text) ||
    /schema cache/.test(text)
  );
}

/** Um item da lista é o mesmo produto que a recomendação? */
export function isDuplicateItem(
  existing: unknown,
  payload: Pick<ListItemPayload, "name" | "brand">,
): boolean {
  const key = normalizeText(payload?.name);
  if (!key) return false;
  const items = Array.isArray(existing) ? existing : [];
  return items.some((item) => {
    if (!item || typeof item !== "object") return false;
    const existingKey = normalizeText((item as { name?: unknown }).name);
    if (!existingKey) return false;
    if (existingKey === key) return true;
    // "Aveia em flocos" × "Aveia em flocos finos": mesma coisa na prática.
    return existingKey.includes(key) || key.includes(existingKey);
  });
}

/**
 * Simula a lista depois da inclusão — usado em teste e na interface para
 * garantir que o item aparece uma única vez e no fim.
 */
export function appendToList<T>(
  items: unknown,
  payload: Pick<ListItemPayload, "name" | "brand">,
): { items: T[]; added: boolean } {
  const list = (Array.isArray(items) ? items : []) as T[];
  if (isDuplicateItem(list, payload)) return { items: list, added: false };
  return { items: [...list, payload as unknown as T], added: true };
}

/** Texto curto para o histórico ("R$"-free, sem foto). */
export function historySummary(entry: HistoryEntry): string {
  const kcal = entry.analysis.portion.nutrients.kcal;
  const origin = ORIGIN_LABELS[entry.analysis.origin];
  return kcal == null ? origin : `${fmtNumber(kcal, 0)} kcal por porção · ${origin}`;
}

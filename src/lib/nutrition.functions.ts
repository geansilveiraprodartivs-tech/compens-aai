import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  EMPTY_NUTRIENTS,
  buildPortion,
  goalLabel,
  hasNutrition,
  nameMatchScore,
  normalizeText,
  nutrientsFromOpenFoodFacts,
  sanitizeNutrients,
  type DataOrigin,
  type FitVerdict,
  type FoodAnalysis,
  type FoodSuggestion,
  type NutritionGoal,
  type Nutrients,
} from "@/lib/nutrition";

/**
 * Analisa a foto de um alimento/embalagem com o gateway de IA já usado pela
 * leitura de preços (nenhuma API nova, nenhuma chave no frontend).
 *
 * Prioridade das fontes (nunca inventar valores):
 *   1. tabela nutricional lida na foto  → origin "label"
 *   2. Open Food Facts (público, sem chave) → origin "openfoodfacts"
 *   3. estimativa pela imagem           → origin "estimate"
 *   4. nada confiável                   → origin "unknown" + problem
 */

const NUTRIENTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kcal", "carbs", "protein", "fat", "sat_fat", "trans_fat", "fiber", "sugar", "sodium"],
  properties: {
    kcal: { type: ["number", "null"] },
    carbs: { type: ["number", "null"] },
    protein: { type: ["number", "null"] },
    fat: { type: ["number", "null"] },
    sat_fat: { type: ["number", "null"] },
    trans_fat: { type: ["number", "null"] },
    fiber: { type: ["number", "null"] },
    sugar: { type: ["number", "null"] },
    sodium: { type: ["number", "null"] },
  },
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "ok",
    "name",
    "brand",
    "category",
    "basis",
    "label_read",
    "barcode",
    "serving_size_text",
    "serving_grams",
    "label",
    "estimate",
    "ingredients",
    "benefits",
    "cautions",
    "verdict",
    "verdict_reason",
    "better_choices",
    "balance_tips",
    "problem",
  ],
  properties: {
    ok: { type: "boolean" },
    name: { type: "string" },
    brand: { type: ["string", "null"] },
    category: { type: ["string", "null"] },
    basis: { type: "string", enum: ["100 g", "100 ml"] },
    /** true só quando a tabela nutricional da embalagem está legível na foto. */
    label_read: { type: "boolean" },
    barcode: { type: ["string", "null"] },
    /** Porção que faz sentido para o alimento (ex.: "1 fatia", "1 copo"). */
    serving_size_text: { type: ["string", "null"] },
    serving_grams: { type: ["number", "null"] },
    /** Valores POR 100 g/ml transcritos do rótulo. Null quando não legível. */
    label: NUTRIENTS_SCHEMA,
    /** Estimativa POR 100 g/ml a partir da imagem. Null quando não houver base. */
    estimate: NUTRIENTS_SCHEMA,
    ingredients: { type: ["string", "null"] },
    benefits: { type: "array", items: { type: "string" } },
    cautions: { type: "array", items: { type: "string" } },
    verdict: { type: "string", enum: ["good", "balanced", "moderation", "alternative"] },
    verdict_reason: { type: "string" },
    better_choices: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "why"],
        properties: { name: { type: "string" }, why: { type: "string" } },
      },
    },
    balance_tips: { type: "array", items: { type: "string" } },
    problem: { type: ["string", "null"] },
  },
} as const;

const PROMPT = `Você é um assistente nutricional do aplicativo CompensAI e analisa fotos de alimentos e de embalagens brasileiras.

Sua tarefa:
1. Identifique o alimento (nome, marca se visível, categoria simples como "Fruta", "Laticínio", "Biscoito", "Bebida").
2. Se for uma EMBALAGEM, tente ler a tabela nutricional, a lista de ingredientes e o código de barras.
   - Preencha "label" APENAS com números que você consegue ler de fato na foto (valores por 100 g ou 100 ml, como na tabela brasileira).
   - Se a tabela estiver ilegível, de outro ângulo, cortada ou ausente: use null em TODOS os campos de "label" e deixe "label_read" = false.
   - Nunca deduza valores do rótulo por conhecimento prévio da marca: só valores visíveis na foto.
3. Se não houver tabela legível (alimento fresco, foto sem embalagem, rótulo ilegível):
   - Preencha "estimate" com uma ESTIMATIVA por 100 g/ml baseada na aparência, tipo de alimento e tabelas de composição usuais (TACO/USDA), usando números realistas.
   - Deixe "label_read" = false.
   - Se não der para identificar o alimento com segurança, deixe "ok" = false, "estimate" com null em tudo e explique em "problem".
4. "serving_size_text" e "serving_grams": porção usual do alimento (ex.: "1 fatia" / 30; "1 copo" / 200; "1 unidade média" / 130; "100 g" / 100).
   Para bebidas use ml em serving_grams. Se não fizer sentido, use 100.
5. "ingredients": transcreva os ingredientes se legíveis; senão null.
6. "benefits": 2 a 4 pontos positivos reais (fibras, proteína, vitaminas, saciedade...). Não invente propriedades medicinais.
7. "cautions": 0 a 4 pontos de atenção (açúcar, sódio, gordura saturada, ultraprocessado, porção pequena...). Sem alarmismo.
8. "verdict" e "verdict_reason": avalie como o alimento se encaixa no objetivo informado.
   - good = "Boa opção para seu objetivo"
   - balanced = "Pode fazer parte de uma alimentação equilibrada"
   - moderation = "Consuma com moderação"
   - alternative = "Considere uma alternativa"
   Explique em 1 ou 2 frases, considerando porção, frequência e contexto. NUNCA diga que um alimento isolado engorda ou emagrece, nunca chame alimento de proibido, nunca faça diagnóstico.
   Se o objetivo for "Só conhecer os valores", use balanced e explique o perfil nutricional em linguagem neutra.
9. "better_choices": 2 a 3 sugestões de compra com nome curto e genérico de produto de supermercado (ex.: "Iogurte natural integral", "Aveia em flocos") e o motivo em uma frase. Nada de marcas inventadas ou preços.
10. "balance_tips": 2 a 4 ideias práticas de como consumir o alimento fotografado com equilíbrio (combinações, porção, momento do dia), sem culpa e sem restrição extrema.
11. "problem": só quando ok = false, em português e curto (ex.: "Não consegui identificar o alimento na foto.").

Nunca invente valores nutricionais. Se não souber, use null. Responda apenas o JSON.`;

type AiNutrients = Record<keyof Nutrients, number | null>;

type AiPayload = {
  ok: boolean;
  name: string;
  brand: string | null;
  category: string | null;
  basis: "100 g" | "100 ml";
  label_read: boolean;
  barcode: string | null;
  serving_size_text: string | null;
  serving_grams: number | null;
  label: AiNutrients;
  estimate: AiNutrients;
  ingredients: string | null;
  benefits: string[];
  cautions: string[];
  verdict: FitVerdict;
  verdict_reason: string;
  better_choices: FoodSuggestion[];
  balance_tips: string[];
  problem: string | null;
};

/* ------------------------------------------------------- Open Food Facts (OFF) */

const OFF_TIMEOUT_MS = 6500;
const OFF_FIELDS = [
  "code",
  "product_name",
  "product_name_pt",
  "brands",
  "nutriments",
  "serving_size",
  "serving_quantity",
  "ingredients_text_pt",
  "ingredients_text",
].join(",");

type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_pt?: string;
  brands?: string;
  nutriments?: Record<string, unknown>;
  serving_size?: string;
  serving_quantity?: number | string;
  ingredients_text_pt?: string;
  ingredients_text?: string;
};

async function offFetch(url: string, timeoutMs = OFF_TIMEOUT_MS): Promise<unknown | null> {
  if (timeoutMs < 700) return null;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "CompensAI/1.0 (app de compras; contato: suporte@compensai.app)",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Aceita só produtos com nome comparável e algum valor nutricional. */
function pickOffCandidate(
  products: OffProduct[],
  name: string,
  barcode: string | null,
): { product: OffProduct; nutrients: Nutrients } | null {
  const scored = products
    .map((product) => {
      const offName = (product.product_name_pt || product.product_name || "").trim();
      const nutrients = nutrientsFromOpenFoodFacts(product.nutriments ?? {});
      const byBarcode = !!barcode && product.code === barcode;
      const score = byBarcode ? 1 : nameMatchScore(name, offName);
      return { product, nutrients, score, byBarcode };
    })
    .filter((item) => hasNutrition(item.nutrients) && (item.byBarcode || item.score >= 0.5))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return null;
  return { product: best.product, nutrients: best.nutrients };
}

async function lookupOpenFoodFacts(
  name: string,
  barcode: string | null,
): Promise<{ product: OffProduct; nutrients: Nutrients } | null> {
  const digits = (barcode ?? "").replace(/\D/g, "");
  const deadline = Date.now() + OFF_TIMEOUT_MS;
  const remaining = () => deadline - Date.now();

  if (digits.length >= 8 && digits.length <= 14) {
    const data = (await offFetch(
      `https://world.openfoodfacts.org/api/v2/product/${digits}.json?fields=${OFF_FIELDS}`,
      remaining(),
    )) as { status?: number; product?: OffProduct } | null;
    if (data && data.status === 1 && data.product) {
      const nutrients = nutrientsFromOpenFoodFacts(data.product.nutriments ?? {});
      if (hasNutrition(nutrients)) return { product: data.product, nutrients };
    }
  }

  const query = normalizeText(name);
  if (query.length < 3) return null;

  // Busca por nome: primeiro o backend novo (search-a-licious), depois o legado.
  const modern = (await offFetch(
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=12&fields=${OFF_FIELDS}`,
    remaining(),
  )) as { hits?: OffProduct[] } | null;
  const modernMatch = pickOffCandidate(modern?.hits ?? [], name, digits || null);
  if (modernMatch) return modernMatch;

  const legacy = (await offFetch(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
      `&search_simple=1&action=process&json=1&page_size=12&fields=${OFF_FIELDS}`,
    remaining(),
  )) as { products?: OffProduct[] } | null;
  return pickOffCandidate(legacy?.products ?? [], name, digits || null);
}

/* ------------------------------------------------------------------ helpers */

function str(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function list(value: unknown, max = 4, maxLen = 220): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => str(item, maxLen))
    .filter((item): item is string => !!item)
    .slice(0, max);
}

function suggestions(value: unknown): FoodSuggestion[] {
  if (!Array.isArray(value)) return [];
  const out: FoodSuggestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const name = str((item as FoodSuggestion).name, 80);
    const why = str((item as FoodSuggestion).why, 160);
    if (name && why) out.push({ name, why });
    if (out.length >= 3) break;
  }
  return out;
}

function readNutrients(value: unknown): Nutrients {
  if (!value || typeof value !== "object") return { ...EMPTY_NUTRIENTS };
  return sanitizeNutrients(value as Partial<Nutrients>);
}

const VERDICT_VALUES: FitVerdict[] = ["good", "balanced", "moderation", "alternative"];

/** Consome o SSE do gateway e devolve o texto final. */
async function readGatewayText(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
        if (ev.type === "error" || ev.type === "response.failed")
          throw new Error(ev.error?.message ?? ev.response?.error?.message ?? "Falha na IA");
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  return out;
}

/* --------------------------------------------------------------- server fn */

export const analyzeFoodPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        image: z.string().startsWith("data:image/").max(8_000_000),
        goal: z.enum(["lose", "maintain", "gain", "know"]).default("know"),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<FoodAnalysis> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("A IA de análise nutricional não está configurada neste ambiente.");

    const goal = data.goal as NutritionGoal;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        Authorization: `Bearer ${key}`,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        text: {
          format: { type: "json_schema", name: "food", strict: true, schema: SCHEMA },
        },
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: `${PROMPT}\n\nObjetivo do usuário: ${goalLabel(goal)}.` },
              { type: "input_image", image_url: data.image },
            ],
          },
        ],
      }),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Muitas análises seguidas. Aguarde alguns segundos.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados.");
      throw new Error(`Falha ao analisar a foto [${res.status}] ${text.slice(0, 160)}`);
    }

    const raw = await readGatewayText(res.body);

    let payload: AiPayload;
    try {
      payload = JSON.parse(raw) as AiPayload;
    } catch {
      return unknownAnalysis(
        "Não consegui entender o resultado da análise. Tente outra foto.",
        null,
        goal,
      );
    }

    const name = str(payload.name, 90) ?? "";
    if (!payload.ok || !name) {
      return unknownAnalysis(
        str(payload.problem, 180) ?? "Não consegui identificar o alimento nesta foto.",
        name || null,
        goal,
      );
    }

    const basis: "100 g" | "100 ml" = payload.basis === "100 ml" ? "100 ml" : "100 g";
    const labelNutrients = readNutrients(payload.label);
    const estimateNutrients = readNutrients(payload.estimate);
    const barcode = str(payload.barcode, 32)?.replace(/\D/g, "") || null;

    const labelOk = payload.label_read === true && hasNutrition(labelNutrients);

    // Prioridade: rótulo > Open Food Facts > estimativa pela imagem.
    let origin: DataOrigin = "unknown";
    let per100: Nutrients = { ...EMPTY_NUTRIENTS };
    let sourceName: string | null = null;
    let sourceUrl: string | null = null;
    let offProduct: OffProduct | null = null;

    if (labelOk) {
      origin = "label";
      per100 = labelNutrients;
    } else {
      const off = await lookupOpenFoodFacts(name, barcode);
      if (off) {
        origin = "openfoodfacts";
        per100 = off.nutrients;
        offProduct = off.product;
        const offName = (off.product.product_name_pt || off.product.product_name || "").trim();
        sourceName = offName
          ? `${offName}${off.product.brands ? ` · ${off.product.brands}` : ""}`.slice(0, 120)
          : "Open Food Facts";
        sourceUrl = off.product.code
          ? `https://world.openfoodfacts.org/product/${off.product.code}`
          : "https://world.openfoodfacts.org";
      } else if (hasNutrition(estimateNutrients)) {
        origin = "estimate";
        per100 = estimateNutrients;
      }
    }

    const servingGrams =
      payload.serving_grams != null && Number.isFinite(payload.serving_grams)
        ? Math.min(Math.max(payload.serving_grams, 1), 5000)
        : offProduct?.serving_quantity != null
          ? Number(offProduct.serving_quantity) || null
          : null;

    const servingLabel =
      str(payload.serving_size_text, 40) ??
      (offProduct?.serving_size ? str(offProduct.serving_size, 40) : null);

    const portion = buildPortion(per100, servingGrams, servingLabel, basis);

    const ingredients =
      str(payload.ingredients, 600) ??
      (offProduct?.ingredients_text_pt ? str(offProduct.ingredients_text_pt, 600) : null) ??
      (offProduct?.ingredients_text ? str(offProduct.ingredients_text, 600) : null);

    const verdict: FitVerdict = VERDICT_VALUES.includes(payload.verdict)
      ? payload.verdict
      : "balanced";

    const reason =
      str(payload.verdict_reason, 320) ??
      (origin === "unknown"
        ? "Sem valores nutricionais confiáveis, não dá para avaliar o encaixe no seu objetivo."
        : "Avaliação geral considerando porção e contexto alimentar.");

    return {
      ok: true,
      name,
      brand: str(payload.brand, 60),
      category: str(payload.category, 50),
      origin,
      goal,
      basis,
      per100,
      portion,
      ingredients,
      benefits: list(payload.benefits, 4),
      cautions: list(payload.cautions, 4),
      fit: { verdict, reason },
      better_choices: suggestions(payload.better_choices),
      balance_tips: list(payload.balance_tips, 4),
      source_name: sourceName,
      source_url: sourceUrl,
      problem:
        origin === "unknown"
          ? (str(payload.problem, 180) ??
            "Não encontrei valores nutricionais confiáveis para este item.")
          : null,
    };
  });

function unknownAnalysis(
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

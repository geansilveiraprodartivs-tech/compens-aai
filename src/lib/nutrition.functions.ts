import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  cleanText,
  composeAnalysis,
  goalLabel,
  hasNutrition,
  nameMatchScore,
  normalizeText,
  nutrientsFromOpenFoodFacts,
  sanitizeNutrients,
  unknownAnalysis,
  type AiFoodPayload,
  type FoodAnalysis,
  type NutritionGoal,
  type OffMatch,
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
): OffMatch | null {
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
  return toOffMatch(best.product, best.nutrients);
}

function toOffMatch(product: OffProduct, nutrients: Nutrients): OffMatch {
  const quantity = Number(product.serving_quantity);
  return {
    nutrients,
    name: cleanText(product.product_name_pt || product.product_name, 120),
    brands: cleanText(product.brands, 60),
    code: cleanText(product.code, 20),
    servingSize: cleanText(product.serving_size, 40),
    servingQuantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
    ingredients: cleanText(product.ingredients_text_pt || product.ingredients_text, 600),
  };
}

async function lookupOpenFoodFacts(name: string, barcode: string | null): Promise<OffMatch | null> {
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
      if (hasNutrition(nutrients)) return toOffMatch(data.product, nutrients);
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

    let payload: AiFoodPayload;
    try {
      payload = JSON.parse(raw) as AiFoodPayload;
    } catch {
      return unknownAnalysis(
        "Não consegui entender o resultado da análise. Tente outra foto.",
        null,
        goal,
      );
    }

    const name = cleanText(payload.name, 90) ?? "";
    // A base pública só é consultada quando o rótulo não foi lido com segurança.
    const labelOk =
      payload.label_read === true && hasNutrition(sanitizeNutrients(payload.label ?? {}));
    const barcode = (payload.barcode ?? "").replace(/\D/g, "") || null;
    const off = labelOk || !name ? null : await lookupOpenFoodFacts(name, barcode);

    return composeAnalysis(payload, off, goal);
  });

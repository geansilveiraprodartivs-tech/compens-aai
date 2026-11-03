import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildRecommendationContext,
  cleanSuggestions,
  cleanText,
  compareSuggestion,
  composeAnalysis,
  filterSuggestions,
  hasNutrition,
  nameMatchScore,
  normalizeText,
  nutrientsFromOpenFoodFacts,
  pageToText,
  sanitizeNutrients,
  sourceMentionsProduct,
  textConfirmsEnergy,
  textOf,
  toNumber,
  unknownAnalysis,
  type AiFoodPayload,
  type FoodAnalysis,
  type FoodSuggestion,
  type NutritionGoal,
  type OffMatch,
  type Nutrients,
  type RecommendationContext,
  type WebMatch,
} from "@/lib/nutrition";

/**
 * Análise nutricional por foto.
 *
 * Princípio central: a IA **identifica** o produto (com ou sem rótulo visível);
 * os números vêm de uma fonte conferível:
 *
 *   1. tabela nutricional legível na própria foto  → origin "label"
 *   2. ficha do produto no Open Food Facts          → origin "openfoodfacts"
 *   3. página encontrada na internet e VERIFICADA   → origin "web"
 *   4. nada disso                                   → origin "unknown" (sem valores)
 *
 * Nenhum valor nutricional é estimado pela IA. Nada de "parece ter X kcal".
 *
 * A verificação da fonte web acontece no servidor: baixamos a página e só
 * aceitamos se ela realmente mostrar o valor de energia e o nome do produto.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

const IDENTIFY_TIMEOUT_MS = 45_000;
const RESEARCH_TIMEOUT_MS = 50_000;
const OFF_BUDGET_MS = 6_500;
const VERIFY_TIMEOUT_MS = 9_000;

/* ------------------------------------------------------------------ schemas */

const NUTRIENTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "kcal",
    "carbs",
    "protein",
    "fat",
    "sat_fat",
    "trans_fat",
    "fiber",
    "sugar",
    "added_sugar",
    "sodium",
  ],
  properties: {
    kcal: { type: ["number", "null"] },
    carbs: { type: ["number", "null"] },
    protein: { type: ["number", "null"] },
    fat: { type: ["number", "null"] },
    sat_fat: { type: ["number", "null"] },
    trans_fat: { type: ["number", "null"] },
    fiber: { type: ["number", "null"] },
    sugar: { type: ["number", "null"] },
    added_sugar: { type: ["number", "null"] },
    sodium: { type: ["number", "null"] },
  },
} as const;

/** Só identificação + o que está escrito na foto. Nenhum número inventado. */
const IDENTIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "ok",
    "name",
    "brand",
    "variant",
    "category",
    "confidence",
    "packaged",
    "barcode",
    "basis",
    "label_read",
    "label",
    "serving_size_text",
    "serving_grams",
    "ingredients",
    "allergens",
    "better_choices",
    "balance_tips",
    "problem",
  ],
  properties: {
    ok: { type: "boolean" },
    name: { type: "string" },
    brand: { type: ["string", "null"] },
    variant: { type: ["string", "null"] },
    category: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    packaged: { type: "boolean" },
    barcode: { type: ["string", "null"] },
    basis: { type: "string", enum: ["100 g", "100 ml"] },
    /** true SÓ quando a tabela nutricional da foto está legível. */
    label_read: { type: "boolean" },
    /** Valores por 100 g/ml transcritos da foto. Null quando ilegível. */
    label: NUTRIENTS_SCHEMA,
    serving_size_text: { type: ["string", "null"] },
    serving_grams: { type: ["number", "null"] },
    ingredients: { type: ["string", "null"] },
    /** Alergênicos escritos na embalagem ("ALÉRGICOS: ..."), só transcrição. */
    allergens: { type: ["string", "null"] },
    better_choices: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "brand", "why", "compare"],
        properties: {
          name: { type: "string" },
          brand: { type: ["string", "null"] },
          why: { type: "string" },
          compare: { type: ["string", "null"] },
        },
      },
    },
    balance_tips: { type: "array", items: { type: "string" } },
    problem: { type: ["string", "null"] },
  },
} as const;

/** Resultado da pesquisa na internet (só aceito depois de verificado). */
const RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "found",
    "product_name",
    "source_name",
    "source_url",
    "basis",
    "nutrients",
    "serving_size",
    "serving_grams",
    "allergens",
    "note",
  ],
  properties: {
    found: { type: "boolean" },
    product_name: { type: ["string", "null"] },
    source_name: { type: ["string", "null"] },
    source_url: { type: ["string", "null"] },
    basis: { type: "string", enum: ["100 g", "100 ml"] },
    nutrients: NUTRIENTS_SCHEMA,
    serving_size: { type: ["string", "null"] },
    serving_grams: { type: ["number", "null"] },
    allergens: { type: ["string", "null"] },
    note: { type: ["string", "null"] },
  },
} as const;

/* ------------------------------------------------------------------- prompts */

const IDENTIFY_PROMPT = `Você é o assistente nutricional do CompensAI e olha fotos de alimentos e produtos brasileiros.

TAREFA 1 — IDENTIFICAR (o mais importante):
- Reconheça o produto mesmo que a embalagem esteja de costas, sem rótulo visível, amassada ou parcialmente na foto.
- Informe "name" (nome do produto ou do alimento), "brand" (marca, se der para ver ou reconhecer com segurança), "variant" (versão/sabor, ex.: "integral", "zero açúcar", "light", "original") e "category" (ex.: "Fruta", "Biscoito", "Laticínio", "Refeição").
- "confidence": "high" quando marca e tipo estão claramente visíveis; "medium" quando dá para reconhecer o produto mas a versão pode variar; "low" quando é só um palpite de categoria.
- "packaged": true se for produto industrializado/embalado; false para frutas, verduras, carnes, refeições e comida preparada.
- "barcode": transcrava o código de barras SÓ se os dígitos estiverem legíveis.
- Se NÃO for possível identificar o produto com segurança: "ok" = false, "name" = "", e escreva em "problem" um pedido curto para o usuário (ex.: "A foto está escura. Tente outra mais nítida ou informe o nome e a marca.").

TAREFA 2 — TRANSCREVER O RÓTULO (se estiver legível):
- Se a tabela nutricional aparecer na foto, copie os valores POR 100 g / 100 ml: energia, carboidratos, proteínas, gorduras totais, saturadas, trans, fibras, açúcares totais, açúcares adicionados e sódio (em mg).
- "added_sugar" é só o que o rótulo chama de "açúcares adicionados"; se a embalagem não separar, use null (nunca deduza subtraindo).
- "label_read" = true apenas quando você conseguiu ler a tabela na foto.
- Se a tabela estiver cortada, ilegível, de outro ângulo ou ausente: "label_read" = false e TODOS os campos de "label" = null.
- NUNCA deduza números do rótulo por conhecer a marca. Só transcreva o que está visível.
- "ingredients": transcreva a lista de ingredientes apenas se legível; senão null.
- "allergens": transcreva apenas a declaração de alergênicos escrita na embalagem (ex.: "Contém leite e soja", "Pode conter amendoim"). Se não houver essa declaração legível, use null. Nunca deduza alergênicos a partir dos ingredientes.

TAREFA 3 — PORÇÃO DE REFERÊNCIA:
- "serving_size_text" e "serving_grams": porção usual (ex.: "1 fatia"/30, "1 copo"/200, "1 unidade média"/130). Para bebidas use ml. Sem noção de porção: 100.

TAREFA 4 — DICAS PERSONALIZADAS (sem números e sem promessas):
- Use o CONTEXTO DO USUÁRIO para escolher as alternativas. Elas precisam fazer sentido para o objetivo dele e respeitar as restrições que ele informou.
- "better_choices": 2 a 3 alternativas de supermercado. Para cada uma preencha:
  - "name": nome genérico do alimento/produto (ex.: "Iogurte natural integral", "Aveia em flocos");
  - "brand": a marca APENAS quando ela estiver visível na foto ou você tiver certeza absoluta; caso contrário null;
  - "why": uma frase curta explicando por que essa alternativa ajuda no objetivo dele;
  - "compare": comparação qualitativa com o produto analisado (ex.: "mais fibras e menos açúcar"), sem nenhum número.
- Não sugira itens que já estão na lista de compras informada no contexto.
- Se o contexto disser que o usuário não definiu objetivo, dê sugestões gerais e neutras (sem dizer que são personalizadas).
- "balance_tips": 2 a 4 ideias práticas de como consumir o alimento com equilíbrio (porção, combinação, momento do dia). Sem culpa, sem proibição, sem valores numéricos.

PROIBIDO:
- Dar qualquer número de calorias ou nutrientes fora dos campos de "label" transcritos da foto.
- Usar conhecimento de tabelas nutricionais de memória, estimar ou "chutar" valores.
- Inventar marcas, preços, embalagens ou alegações de saúde.
- Presumir doenças, alergias, dietas ou restrições que o usuário não informou.
- Fazer diagnóstico, prometer emagrecimento ou garantir segurança para alergias.

Responda apenas o JSON.`;

const RESEARCH_PROMPT = `Você pesquisa dados nutricionais reais na internet para o app CompensAI.

Você recebe um alimento/produto já identificado. Pesquise na web os valores nutricionais DESTE item, por 100 g ou 100 ml.

Prioridade das fontes:
1. site oficial do fabricante ou da marca;
2. página/ficha técnica oficial do produto;
3. tabela oficial de composição de alimentos (TBCA/USP, TACO/Unicamp, USDA FoodData Central);
4. bases de dados nutricionais reconhecidas (Open Food Facts, Nutritionix, FatSecret);
5. outras fontes verificáveis, apenas se as anteriores não tiverem o item.

Regras obrigatórias:
- Só informe números que estejam escritos na página que você consultou.
- "source_url" deve ser a URL exata da página onde encontrou a tabela nutricional.
- "source_name" é o nome do site (ex.: "Nestlé Brasil", "TBCA - USP", "USDA FoodData Central").
- Use o código de barras, marca, nome, versão/sabor e tamanho da embalagem para confirmar que a página é DESTE produto. Nomes parecidos não bastam.
- Se a página for de OUTRA versão/sabor do produto, preencha "product_name" com o nome exato dela e explique em "note".
- "allergens": copie só se a página declarar os alergênicos deste produto; senão null. Nunca deduza dos ingredientes.
- "added_sugar": só se a página separar açúcares adicionados dos totais; senão null.
- NUNCA estime, arredonde "por conta própria" ou use valores de um produto parecido como se fossem deste.
- Se não encontrar fonte confiável com os valores deste item específico: "found" = false, todos os nutrientes = null e o resto = null.
- Nunca informe 0 kcal sem que a fonte diga 0 kcal.
- Para alimentos naturais sem marca, use a tabela oficial do alimento (ex.: "banana prata" na TBCA/TACO/USDA) e diga qual tabela usou.

Responda apenas o JSON.`;

/* --------------------------------- sugestões personalizadas (texto, sem foto) */

/** Só o que a IA pode dizer sobre uma alternativa — nunca números. */
const SUGGESTION_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "brand", "why", "compare"],
  properties: {
    name: { type: "string" },
    brand: { type: ["string", "null"] },
    why: { type: "string" },
    compare: { type: ["string", "null"] },
  },
} as const;

const SUGGEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["choices"],
  properties: { choices: { type: "array", items: SUGGESTION_ITEM_SCHEMA } },
} as const;

const SUGGEST_PROMPT = `Você sugere alternativas de compra no app CompensAI.

Recebe um alimento/produto já analisado (nome, marca, versão e os valores por 100 g/ml que o app conseguiu confirmar) e o CONTEXTO DO USUÁRIO.

Sua tarefa: devolver 2 ou 3 alternativas comuns de supermercado que possam ser melhores para o objetivo dele.

Para cada alternativa:
- "name": nome genérico do alimento/produto (ex.: "Aveia em flocos", "Iogurte natural integral"). Nada de nome de fantasia.
- "brand": a marca apenas quando você tiver certeza absoluta de que ela existe e produz esse item; caso contrário null. Nunca invente marca.
- "why": uma frase curta explicando por que essa alternativa ajuda no objetivo dele.
- "compare": comparação qualitativa com o produto analisado (ex.: "mais fibras e menos açúcar"), sem nenhum número.

Regras obrigatórias:
- Nunca escreva números de calorias ou nutrientes: o app busca os valores em fontes reais.
- Respeite as restrições e alergias informadas. Não presuma nenhuma que não esteja no contexto.
- Não repita itens que já estão na lista de compras.
- Se o usuário não definiu objetivo, dê sugestões gerais de variedade, sem julgar alimentos como bons ou ruins.
- Nada de promessa de saúde, emagrecimento ou cura.

Responda apenas o JSON.`;

/* ---------------------------------------------------------- gateway de IA */

function gatewayKey(required: true): string;
function gatewayKey(required: false): string | null;
function gatewayKey(required: boolean): string | null {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key && required) {
    throw new Error(
      "A análise nutricional por IA não está configurada neste ambiente. Configure LOVABLE_API_KEY no servidor.",
    );
  }
  return key ?? null;
}

type GatewayResult =
  { ok: true; text: string; urls: string[] } | { ok: false; status: number; message: string };

/** Consome o SSE do gateway e devolve o texto final + URLs citadas. */
async function readSse(
  body: ReadableStream<Uint8Array>,
): Promise<{ text: string; urls: string[] }> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  const urls = new Set<string>();

  const collect = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const item = node as { type?: string; url?: unknown; annotations?: unknown; content?: unknown };
    if (typeof item.url === "string" && /^https?:\/\//.test(item.url)) urls.add(item.url);
    if (Array.isArray(item.annotations)) item.annotations.forEach(collect);
    if (Array.isArray(item.content)) item.content.forEach(collect);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let index: number;
    while ((index = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, index).trim();
      buf = buf.slice(index + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as Record<string, unknown> & {
          type?: string;
          delta?: string;
          annotation?: unknown;
          response?: { output?: unknown };
          error?: { message?: string };
        };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          out += event.delta;
        }
        if (event.type === "response.output_text.annotation.added") collect(event.annotation);
        if (event.type === "response.completed") collect(event.response?.output);
        if (event.type === "error" || event.type === "response.failed") {
          throw new Error(event.error?.message ?? "Falha na IA");
        }
      } catch (error) {
        if (error instanceof SyntaxError) continue;
        throw error;
      }
    }
  }
  return { text: out, urls: [...urls] };
}

type RunOptions = {
  key: string;
  body: Record<string, unknown>;
  timeoutMs: number;
};

async function runGateway({ key, body, timeoutMs }: RunOptions): Promise<GatewayResult> {
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        Authorization: `Bearer ${key}`,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({ model: MODEL, stream: true, store: false, ...body }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, message: text.slice(0, 200) };
    }
    const { text, urls } = await readSse(res.body);
    return { ok: true, text, urls };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : "Falha de rede",
    };
  }
}

function friendlyGatewayError(status: number, detail: string): Error {
  if (status === 429) return new Error("Muitas análises seguidas. Aguarde alguns segundos.");
  if (status === 402) return new Error("Os créditos de IA acabaram. Tente novamente mais tarde.");
  if (status === 0) return new Error("A análise demorou demais para responder. Tente novamente.");
  return new Error(`Não foi possível analisar agora [${status}] ${detail.slice(0, 120)}`);
}

function parseJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/* -------------------------------------------------------- identificação */

type IdentifyOptions = {
  image?: string;
  hint?: string;
  /** Objetivo + preferências + restrições + itens já na lista. */
  context?: RecommendationContext;
};

async function identifyFood({ image, hint, context }: IdentifyOptions): Promise<AiFoodPayload> {
  const key = gatewayKey(true);

  const contextText = context ? buildRecommendationContext(context) : null;
  const content: Record<string, unknown>[] = [
    {
      type: "input_text",
      text: contextText ? `${IDENTIFY_PROMPT}\n\n${contextText}` : IDENTIFY_PROMPT,
    },
  ];
  if (hint) {
    content.push({
      type: "input_text",
      text: `O usuário informou: ${hint}. Confirme ou corrija a identificação usando a foto.`,
    });
  }
  if (image) content.push({ type: "input_image", image_url: image });

  const result = await runGateway({
    key,
    timeoutMs: IDENTIFY_TIMEOUT_MS,
    body: {
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: "food_identity",
          strict: true,
          schema: IDENTIFY_SCHEMA,
        },
      },
      input: [{ role: "user", content }],
    },
  });

  if (!result.ok) {
    // Sem web_search aqui, mas o gateway pode recusar configurações; erro é repassado.
    throw friendlyGatewayError(result.status, result.message);
  }

  const parsed = parseJson(result.text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      problem: "Não consegui entender o resultado da análise. Tente outra foto.",
    };
  }
  return parsed as AiFoodPayload;
}

/* ------------------------------------------------------- Open Food Facts */

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
  "allergens",
].join(",");

/**
 * Formato bruto do Open Food Facts. Os campos são `unknown` de propósito: a
 * base pública devolve número, lista ou objeto em campos que deveriam ser
 * texto, e era exatamente aí que a análise quebrava.
 */
type OffProduct = {
  code?: unknown;
  product_name?: unknown;
  product_name_pt?: unknown;
  brands?: unknown;
  nutriments?: unknown;
  serving_size?: unknown;
  serving_quantity?: unknown;
  ingredients_text_pt?: unknown;
  ingredients_text?: unknown;
  allergens?: unknown;
};

async function offFetch(url: string, timeoutMs: number): Promise<unknown | null> {
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

function toOffMatch(product: OffProduct, nutrients: Nutrients): OffMatch {
  return {
    nutrients,
    name: textOf(product.product_name_pt, 120) ?? textOf(product.product_name, 120) ?? null,
    brands: textOf(product.brands, 60),
    code: textOf(product.code, 20),
    servingSize: textOf(product.serving_size, 40),
    servingQuantity: toNumber(product.serving_quantity),
    ingredients: textOf(product.ingredients_text_pt, 600) ?? textOf(product.ingredients_text, 600),
    allergens: textOf(product.allergens, 300),
  };
}

/** Escolhe o candidato mais parecido, exigindo marca compatível quando informada. */
function pickOffCandidate(
  products: unknown,
  wanted: { name: unknown; brand: unknown },
  barcode: unknown,
): OffMatch | null {
  const list = Array.isArray(products)
    ? products.filter((item): item is OffProduct => !!item && typeof item === "object")
    : [];
  if (list.length === 0) return null;

  const nameText = textOf(wanted.name, 120) ?? "";
  const brandKey = normalizeText(wanted.brand);
  const code = textOf(barcode, 24);
  if (!nameText && !code) return null;

  const scored = list
    .map((product) => {
      const offName =
        textOf(product.product_name_pt, 120) ?? textOf(product.product_name, 120) ?? "";
      const offBrands = normalizeText(product.brands);
      const nutrients = nutrientsFromOpenFoodFacts(product.nutriments);
      const byBarcode = !!code && textOf(product.code, 24) === code;
      const score = byBarcode ? 1 : nameMatchScore(nameText, offName);
      const brandOk =
        !brandKey || offBrands.includes(brandKey) || nameMatchScore(brandKey, offBrands) >= 0.6;
      return { product, nutrients, score, byBarcode, brandOk };
    })
    .filter(
      (item) =>
        hasNutrition(item.nutrients) &&
        (item.byBarcode || (item.score >= 0.5 && item.brandOk) || item.score >= 0.78),
    )
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  return best ? toOffMatch(best.product, best.nutrients) : null;
}

async function lookupOpenFoodFacts(
  wanted: {
    name: unknown;
    brand: unknown;
    barcode: unknown;
  },
  budgetMs = OFF_BUDGET_MS,
): Promise<OffMatch | null> {
  const digits = (textOf(wanted.barcode, 32) ?? "").replace(/\D/g, "");
  const deadline = Date.now() + budgetMs;
  const remaining = () => deadline - Date.now();

  if (digits.length >= 8 && digits.length <= 14) {
    const data = (await offFetch(
      `https://world.openfoodfacts.org/api/v2/product/${digits}.json?fields=${OFF_FIELDS}`,
      remaining(),
    )) as { status?: unknown; product?: OffProduct } | null;
    if (data && data.status === 1 && data.product && typeof data.product === "object") {
      const nutrients = nutrientsFromOpenFoodFacts(data.product.nutriments);
      if (hasNutrition(nutrients)) return toOffMatch(data.product, nutrients);
    }
  }

  const query = normalizeText(
    [textOf(wanted.brand, 60), textOf(wanted.name, 120)].filter(Boolean).join(" "),
  );
  if (query.length < 3) return null;

  const modern = (await offFetch(
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=15&fields=${OFF_FIELDS}`,
    remaining(),
  )) as { hits?: unknown } | null;
  const modernMatch = pickOffCandidate(modern?.hits, wanted, digits || null);
  if (modernMatch) return modernMatch;

  const legacy = (await offFetch(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
      `&search_simple=1&action=process&json=1&page_size=15&fields=${OFF_FIELDS}`,
    remaining(),
  )) as { products?: unknown } | null;
  return pickOffCandidate(legacy?.products, wanted, digits || null);
}

/* -------------------------------------------- pesquisa web + verificação */

type ResearchTarget = {
  name: string;
  brand: string | null;
  variant: string | null;
  category: string | null;
  packaged: boolean | null;
};

type ResearchPayload = {
  found?: boolean;
  product_name?: unknown;
  source_name?: unknown;
  source_url?: unknown;
  basis?: unknown;
  nutrients?: unknown;
  serving_size?: unknown;
  serving_grams?: unknown;
  allergens?: unknown;
  note?: unknown;
};

/**
 * Baixa a página citada e confere: respondeu 200, fala de energia/calorias com
 * o número informado e menciona o produto. Sem isso, a fonte é descartada.
 * Recebe `unknown` porque a URL e o número vêm do JSON da IA.
 */
async function verifyWebSource(
  url: unknown,
  productName: unknown,
  kcal: unknown,
): Promise<boolean> {
  const target = textOf(url, 500);
  if (!target || !/^https?:\/\//i.test(target)) return false;
  try {
    const res = await fetch(target, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; CompensAI/1.0; +https://compens-aai.lovable.app) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!res.ok) return false;

    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) return false;

    const html = (await res.text()).slice(0, 900_000);
    const text = pageToText(html);
    if (text.length < 400) return false;

    if (!textConfirmsEnergy(text, kcal)) return false;

    return sourceMentionsProduct(text, productName);
  } catch {
    return false;
  }
}

async function researchWeb(target: ResearchTarget): Promise<WebMatch | null> {
  const key = gatewayKey(false);
  if (!key) return null;

  const description = [
    `Produto: ${textOf(target.name, 120) ?? ""}`,
    target.brand ? `Marca: ${textOf(target.brand, 60) ?? ""}` : null,
    target.variant ? `Versão/sabor: ${textOf(target.variant, 40) ?? ""}` : null,
    target.category ? `Categoria: ${textOf(target.category, 50) ?? ""}` : null,
    target.packaged === false
      ? "É um alimento natural ou preparado, sem embalagem de marca."
      : "É um produto embalado.",
  ]
    .filter(Boolean)
    .join("\n");

  const body = (tools: boolean): Record<string, unknown> => ({
    reasoning: { effort: "low" },
    ...(tools ? { tools: [{ type: "web_search" }], tool_choice: "auto" } : {}),
    text: {
      format: { type: "json_schema", name: "food_research", strict: true, schema: RESEARCH_SCHEMA },
    },
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: `${RESEARCH_PROMPT}\n\n${description}` }],
      },
    ],
  });

  let result = await runGateway({ key, body: body(true), timeoutMs: RESEARCH_TIMEOUT_MS });
  if (!result.ok && (result.status === 400 || result.status === 404 || result.status === 422)) {
    // Gateway sem suporte à ferramenta de busca: tenta sem ela e só aceita o
    // resultado se a página citada for verificada por download real.
    result = await runGateway({ key, body: body(false), timeoutMs: RESEARCH_TIMEOUT_MS });
  }
  if (!result.ok) return null;

  const parsed = parseJson(result.text) as ResearchPayload | null;
  if (!parsed || typeof parsed !== "object" || parsed.found !== true) return null;

  const url = textOf(parsed.source_url, 500);
  if (!url || !/^https?:\/\//i.test(url)) return null;

  const nutrients = sanitizeNutrients(parsed.nutrients);
  if (!hasNutrition(nutrients)) return null;

  const productName = textOf(parsed.product_name, 120) ?? target.name;
  const verified = await verifyWebSource(url, productName, nutrients.kcal);
  if (!verified) return null;

  const hostname = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  })();

  return {
    sourceName: textOf(parsed.source_name, 80) ?? hostname ?? "Página na internet",
    sourceUrl: url,
    productName,
    nutrients,
    servingSize: textOf(parsed.serving_size, 40),
    servingGrams: toNumber(parsed.serving_grams),
    ingredients: null,
    allergens: textOf(parsed.allergens, 300),
  };
}

/* ------------------------------------- alternativas personalizadas + fontes */

const SUGGEST_TIMEOUT_MS = 25_000;
/** Orçamento curto por alternativa: a análise não pode ficar lenta. */
const SUGGESTION_LOOKUP_BUDGET_MS = 4_000;

/** Resumo do produto analisado para a IA sugerir alternativas coerentes. */
function describeAnalysis(analysis: FoodAnalysis): string {
  const lines = [`Produto analisado: ${analysis.name}`];
  if (analysis.brand) lines.push(`Marca: ${analysis.brand}`);
  if (analysis.variant) lines.push(`Versão/sabor: ${analysis.variant}`);
  if (analysis.category) lines.push(`Categoria: ${analysis.category}`);

  if (analysis.origin !== "unknown") {
    const unit = analysis.basis === "100 ml" ? "100 ml" : "100 g";
    const values = analysis.per100;
    const parts = [
      values.kcal != null ? `${values.kcal} kcal` : null,
      values.fiber != null ? `${values.fiber} g de fibras` : null,
      values.sugar != null ? `${values.sugar} g de açúcares` : null,
      values.added_sugar != null ? `${values.added_sugar} g de açúcares adicionados` : null,
      values.protein != null ? `${values.protein} g de proteína` : null,
      values.sat_fat != null ? `${values.sat_fat} g de gordura saturada` : null,
      values.sodium != null ? `${values.sodium} mg de sódio` : null,
    ].filter(Boolean);
    if (parts.length > 0) lines.push(`Valores confirmados por ${unit}: ${parts.join(", ")}.`);
  } else {
    lines.push("Não há valores nutricionais confirmados para este produto.");
  }
  return lines.join("\n");
}

/**
 * Sugestões para os caminhos em que a IA não devolveu alternativas (ex.:
 * pesquisa por nome). Se o gateway falhar, a análise continua sem sugestões.
 */
async function suggestChoices(params: {
  analysis: FoodAnalysis;
  context: RecommendationContext;
}): Promise<FoodSuggestion[]> {
  const key = gatewayKey(false);
  if (!key) return [];

  try {
    const result = await runGateway({
      key,
      timeoutMs: SUGGEST_TIMEOUT_MS,
      body: {
        reasoning: { effort: "low" },
        text: {
          format: {
            type: "json_schema",
            name: "better_choices",
            strict: true,
            schema: SUGGEST_SCHEMA,
          },
        },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  SUGGEST_PROMPT,
                  describeAnalysis(params.analysis),
                  buildRecommendationContext(params.context),
                ].join("\n\n"),
              },
            ],
          },
        ],
      },
    });
    if (!result.ok) return [];

    const parsed = parseJson(result.text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return cleanSuggestions((parsed as { choices?: unknown }).choices);
  } catch (error) {
    console.error("[CompensAI] sugestões indisponíveis:", error);
    return [];
  }
}

/**
 * Busca os valores reais de cada alternativa (Open Food Facts) e monta a
 * comparação numérica com o produto analisado. Alternativa sem fonte fica
 * apenas com nome/motivo — nunca com número inventado.
 */
async function enrichSuggestions(
  suggestions: FoodSuggestion[],
  reference: { per100: Nutrients; origin: FoodAnalysis["origin"]; goal: NutritionGoal },
): Promise<FoodSuggestion[]> {
  return Promise.all(
    suggestions.map(async (suggestion) => {
      const off = await lookupOpenFoodFacts(
        {
          name: suggestion.name,
          brand: suggestion.brand ?? null,
          barcode: suggestion.barcode ?? null,
        },
        SUGGESTION_LOOKUP_BUDGET_MS,
      );
      if (!off || !hasNutrition(off.nutrients)) return suggestion;

      const offName = textOf(off.name, 120);
      const offBrands = textOf(off.brands, 60);
      const code = textOf(off.code, 32);

      const enriched: FoodSuggestion = {
        ...suggestion,
        brand: suggestion.brand ?? offBrands,
        barcode: suggestion.barcode ?? code,
        per100: off.nutrients,
        basis: "100 g",
        source_name: (offName
          ? offBrands
            ? `${offName} · ${offBrands}`
            : offName
          : "Open Food Facts"
        ).slice(0, 80),
        source_url: code
          ? `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`
          : "https://world.openfoodfacts.org",
      };

      if (reference.origin !== "unknown") {
        const comparison = compareSuggestion(reference.per100, off.nutrients, reference.goal);
        if (comparison) enriched.compare = comparison;
      }
      return enriched;
    }),
  );
}

/**
 * Fecha a análise com alternativas coerentes com o usuário: remove o que ele
 * já tem na lista, gera sugestões quando faltam e confirma os valores em fonte.
 */
async function withPersonalizedChoices(
  analysis: FoodAnalysis,
  context: RecommendationContext,
): Promise<FoodAnalysis> {
  if (!analysis.ok) return analysis;

  let choices = filterSuggestions(analysis.better_choices, context.listItems);
  if (choices.length === 0) {
    choices = filterSuggestions(await suggestChoices({ analysis, context }), context.listItems);
  }
  if (choices.length === 0) return { ...analysis, better_choices: [] };

  const enriched = await enrichSuggestions(choices, {
    per100: analysis.per100,
    origin: analysis.origin,
    goal: analysis.goal ?? context.goal,
  });
  return { ...analysis, better_choices: enriched };
}

/* --------------------------------------------------------------- handlers */

const GOAL = z.enum(["lose", "maintain", "gain", "know"]).default("know");

const USER_CONTEXT_SCHEMA = {
  preferences: z.string().trim().max(160).optional(),
  restrictions: z.string().trim().max(160).optional(),
  listItems: z.array(z.string().trim().max(80)).max(20).optional(),
};

type UserContextInput = {
  goal: NutritionGoal;
  preferences?: string | undefined;
  restrictions?: string | undefined;
  listItems?: string[] | undefined;
};

function toRecommendationContext(data: UserContextInput): RecommendationContext {
  return {
    goal: data.goal,
    preferences: cleanText(data.preferences, 160),
    restrictions: cleanText(data.restrictions, 160),
    listItems: data.listItems ?? [],
  };
}

export const analyzeFoodPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        image: z.string().startsWith("data:image/").max(8_000_000),
        goal: GOAL,
        ...USER_CONTEXT_SCHEMA,
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<FoodAnalysis> => {
    const { assertPremium } = await import("@/lib/entitlement.server");
    await assertPremium(context.userId);

    const goal = data.goal as NutritionGoal;
    const recommendation = toRecommendationContext({ ...data, goal });
    const payload = await identifyFood({ image: data.image, context: recommendation });

    const name = cleanText(payload.name, 90) ?? "";
    const brand = cleanText(payload.brand, 60);
    if (payload.ok === false || !name) return composeAnalysis(payload, {}, goal);

    const labelOk =
      payload.label_read === true && hasNutrition(sanitizeNutrients(payload.label ?? {}));

    let off: OffMatch | null = null;
    let web: WebMatch | null = null;

    if (!labelOk) {
      off = await lookupOpenFoodFacts({
        name,
        brand,
        barcode: textOf(payload.barcode, 32),
      });
      if (!off) {
        web = await researchWeb({
          name,
          brand,
          variant: cleanText(payload.variant, 40),
          category: cleanText(payload.category, 50),
          packaged: payload.packaged ?? null,
        });
      }
    }

    const analysis = composeAnalysis(payload, { off, web }, goal);
    return withPersonalizedChoices(analysis, recommendation);
  });

/**
 * Caminho sem foto (ou quando a foto não bastou): usuário informa nome e marca
 * e a mesma pesquisa é feita — Open Food Facts primeiro, internet depois.
 */
export const researchFoodByName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        brand: z.string().trim().max(60).optional(),
        goal: GOAL,
        ...USER_CONTEXT_SCHEMA,
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<FoodAnalysis> => {
    const { assertPremium } = await import("@/lib/entitlement.server");
    await assertPremium(context.userId);

    const goal = data.goal as NutritionGoal;
    const recommendation = toRecommendationContext({ ...data, goal });
    const name = data.name.trim();
    const brand = data.brand?.trim() || null;

    const off = await lookupOpenFoodFacts({ name, brand, barcode: null });
    if (off) {
      return withPersonalizedChoices(
        composeAnalysis(
          { ok: true, name, brand, confidence: "medium", packaged: true },
          { off },
          goal,
        ),
        recommendation,
      );
    }

    const web = await researchWeb({
      name,
      brand,
      variant: null,
      category: null,
      packaged: true,
    });
    if (web) {
      return withPersonalizedChoices(
        composeAnalysis(
          { ok: true, name, brand, confidence: "medium", packaged: true },
          { web },
          goal,
        ),
        recommendation,
      );
    }

    return unknownAnalysis(
      "Não encontrei uma fonte confiável com os valores deste item. Tente acrescentar a marca e a versão (ex.: “Nescau 2.0 pó”) ou fotografe a tabela nutricional da embalagem.",
      name,
      goal,
    );
  });

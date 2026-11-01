import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Lê a foto de um produto/etiqueta e extrai nome, preço e unidade de venda. */

export type PhotoProduct = {
  ok: boolean;
  name: string;
  price: number | null;
  regular_price: number | null;
  unit: string | null;
  package_size: number | null;
  package_unit: string | null;
  price_note: string | null;
  problem: string | null;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "name", "price", "regular_price", "unit", "package_size", "package_unit", "price_note", "problem"],
  properties: {
    ok: { type: "boolean" },
    name: { type: "string" },
    price: { type: ["number", "null"] },
    regular_price: { type: ["number", "null"] },
    unit: { type: ["string", "null"], enum: ["un", "kg", "g", "L", "ml", null] },
    package_size: { type: ["number", "null"] },
    package_unit: { type: ["string", "null"], enum: ["kg", "g", "L", "ml", "un", null] },
    price_note: { type: ["string", "null"] },
    problem: { type: ["string", "null"] },
  },
};

const PROMPT = `Você lê fotos de produtos e etiquetas de preço de supermercados brasileiros.
Extraia:
- name: nome do produto com marca e tamanho se visíveis (ex.: "Arroz Tio João 5kg").
- price: preço de UMA unidade de venda em reais (número). Regras:
  "R$ 5,99" → 5.99; "R$ 12,90/unidade" → 12.90 (unit "un");
  "R$ 5,99/kg" → 5.99 (unit "kg"); "2 por R$ 10,00" → 5.00; "3 unidades por R$ 15,00" → 5.00.
  Em promoção, use o preço promocional (o que o cliente paga). Explique o cálculo em price_note (ex.: "2 por R$ 10,00").
- regular_price: se a etiqueta mostrar DOIS valores (ex.: preço normal e preço promocional/clube/atacado), coloque aqui o outro valor por unidade; senão null.
- unit: unidade de venda se visível ("un","kg","g","L","ml"), senão null.
- package_size e package_unit: conteúdo da embalagem se visível (ex.: "5kg" → 5,"kg"; "900ml" → 900,"ml"; "12 rolos" → 12,"un"), senão null.
- ok: false se não der para identificar claramente o produto OU o preço; então descreva em problem, em português, curto (ex.: "Preço não está legível").
Nunca invente valores. Responda só o JSON.`;

export const analyzeProductPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ image: z.string().startsWith("data:image/").max(8_000_000) }).parse(d),
  )
  .handler(async ({ data }): Promise<PhotoProduct> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("IA não configurada.");
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
        text: { format: { type: "json_schema", name: "product", strict: true, schema: SCHEMA } },
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: PROMPT },
              { type: "input_image", image_url: data.image },
            ],
          },
        ],
      }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Muitas fotos seguidas. Aguarde alguns segundos.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados.");
      throw new Error(`Falha ao analisar a foto [${res.status}] ${t.slice(0, 160)}`);
    }
    // Consome o SSE e junta o texto final.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let out = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
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
    try {
      const p = JSON.parse(out) as PhotoProduct;
      return { ...p, name: (p.name ?? "").trim() };
    } catch {
      return { ok: false, name: "", price: null, regular_price: null, unit: null, package_size: null, package_unit: null, price_note: null, problem: "Não consegui ler a foto." };
    }
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Ranking dos 5 mercados pelas ofertas da semana.
 * Para cada rede: encontra a página oficial de ofertas e conta quantas ofertas
 * estão publicadas nela. Não mostramos preços — só o link oficial.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";

const CHAINS = [
  { name: "Cestto Atacadista", domain: "cestto.com.br", fallback: "https://www.cestto.com.br/ofertas" },
  { name: "Atacadão", domain: "atacadao.com.br", fallback: "https://www.atacadao.com.br/ofertas" },
  { name: "Macromix Atacado", domain: "macromixatacado.com.br", fallback: "https://www.macromixatacado.com.br" },
  { name: "Asun Supermercados", domain: "asun.com.br", fallback: "https://www.asun.com.br/ofertas" },
  { name: "Fort Atacadista", domain: "fortatacadista.com.br", fallback: "https://www.fortatacadista.com.br/ofertas" },
];

export type ChainOffers = {
  name: string;
  url: string;
  offersCount: number;
  found: boolean;
};

function headers() {
  const a = process.env["LOVABLE_API_KEY"];
  const b = process.env["FIRECRAWL_API_KEY"];
  if (!a || !b) throw new Error("Leitura dos sites não configurada.");
  return { "Content-Type": "application/json", Authorization: `Bearer ${a}`, "X-Connection-Api-Key": b };
}

async function fc(path: string, body: unknown) {
  const res = await fetch(`${GATEWAY}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Firecrawl ${path} [${res.status}]: ${text.slice(0, 200)}`);
  return JSON.parse(text) as Record<string, any>;
}

async function findUrl(chain: (typeof CHAINS)[number], city: string) {
  for (const q of [
    `${chain.name} ofertas da semana ${city} site:${chain.domain}`,
    `${chain.name} ofertas ${city}`,
  ]) {
    try {
      const d = await fc("/search", { query: q, limit: 5, lang: "pt", country: "br" });
      const p = d["data"];
      const results: Array<{ url?: string }> = Array.isArray(p) ? p : (p?.web ?? []);
      const hit = results.find((r) => r.url?.includes(chain.domain.split(".")[0] ?? chain.domain));
      if (hit?.url) return hit.url;
    } catch (e) {
      console.error(chain.name, e);
    }
  }
  return null;
}

async function countOffers(url: string) {
  try {
    const d = await fc("/scrape", {
      url,
      onlyMainContent: true,
      formats: [
        {
          type: "json",
          schema: {
            type: "object",
            properties: { offer_count: { type: "number" } },
            required: ["offer_count"],
          },
          prompt:
            "Conte quantos produtos em oferta/promoção estão publicados nesta página. Responda 0 se não houver.",
        },
      ],
    });
    const json = d["json"] ?? d["data"]?.json ?? {};
    const n = Number(json.offer_count);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  } catch (e) {
    console.error(url, e);
    return 0;
  }
}

export const getWeeklyOffers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ city: z.string().min(2) }).parse(i))
  .handler(async ({ data }) => {
    const city = data.city.trim();
    const list: ChainOffers[] = await Promise.all(
      CHAINS.map(async (chain) => {
        const found = await findUrl(chain, city);
        const url = found ?? chain.fallback;
        const offersCount = await countOffers(url);
        return { name: chain.name, url, offersCount, found: !!found };
      }),
    );
    list.sort((a, b) => b.offersCount - a.offersCount);
    return { city, updatedAt: new Date().toISOString(), stores: list };
  });

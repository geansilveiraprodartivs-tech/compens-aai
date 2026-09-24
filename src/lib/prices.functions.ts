import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Coleta REAL de ofertas da semana, direto dos sites oficiais dos mercados.
 *
 * Nenhum preço é inventado: cada linha gravada guarda o mercado, o preço, a
 * unidade, a URL de origem, a data/hora da coleta e a validade da promoção.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";

const CHAINS = [
  { name: "Cestto Atacadista", domain: "cestto.com.br" },
  { name: "Atacadão", domain: "atacadao.com.br" },
  { name: "Macromix Atacado", domain: "macromixatacado.com.br" },
  { name: "Asun Supermercados", domain: "asun.com.br" },
  { name: "Fort Atacadista", domain: "fortatacadista.com.br" },
] as const;

const OFFER_SCHEMA = {
  type: "object",
  properties: {
    offers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          product_name: { type: "string" },
          brand: { type: "string" },
          price: { type: "number" },
          regular_price: { type: "number" },
          quantity: { type: "number" },
          unit: { type: "string" },
          valid_until: { type: "string" },
        },
        required: ["product_name", "price"],
      },
    },
  },
  required: ["offers"],
};

type Offer = {
  product_name?: string;
  brand?: string;
  price?: number;
  regular_price?: number;
  quantity?: number;
  unit?: string;
  valid_until?: string;
};

function fcHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["FIRECRAWL_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error("O serviço de leitura dos sites dos mercados não está configurado.");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
  };
}

async function fcPost(path: string, body: unknown) {
  const res = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: fcHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Firecrawl ${path} falhou [${res.status}]: ${text}`);
    throw new Error(`Firecrawl ${path} [${res.status}]: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as Record<string, any>;
}

/** Encontra a página de ofertas da semana da rede, na cidade do usuário. */
async function findOffersUrl(chain: (typeof CHAINS)[number], city: string) {
  const data = await fcPost("/search", {
    query: `${chain.name} ofertas da semana ${city} site:${chain.domain}`,
    limit: 4,
    lang: "pt",
    country: "br",
  });
  const payload = data["data"];
  const results: Array<{ url?: string }> = Array.isArray(payload)
    ? payload
    : (payload?.web ?? data["web"] ?? []);
  const match = results.find((r) => r.url?.includes(chain.domain));
  return match?.url ?? results[0]?.url ?? null;
}

/** Lê a página oficial e extrai as ofertas publicadas. */
async function scrapeOffers(url: string): Promise<Offer[]> {
  const data = await fcPost("/scrape", {
    url,
    onlyMainContent: true,
    formats: [
      {
        type: "json",
        schema: OFFER_SCHEMA,
        prompt:
          "Extraia apenas as ofertas/promoções de supermercado realmente publicadas nesta página: nome do produto, marca, preço promocional em reais, preço normal (se houver), quantidade e unidade da embalagem (kg, g, L, ml, un) e a data de validade da oferta. Não invente nenhum item ou preço.",
      },
    ],
  });
  const json = data["json"] ?? data["data"]?.json ?? {};
  const offers = Array.isArray(json.offers) ? (json.offers as Offer[]) : [];
  return offers.filter((o) => o.product_name && typeof o.price === "number" && o.price > 0);
}

function endOfWeek() {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()));
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
}

function normalizeUnit(unit?: string) {
  const u = (unit ?? "un").toLowerCase().trim();
  if (["kg", "g", "l", "ml", "un"].includes(u)) return u;
  if (u.startsWith("quil")) return "kg";
  if (u.startsWith("gram")) return "g";
  if (u.startsWith("lit")) return "l";
  return "un";
}

export const refreshPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        city: z.string().min(2),
        state: z.string().optional().nullable(),
        lat: z.number().optional().nullable(),
        lng: z.number().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const city = data.city.trim();
    const collectedAt = new Date().toISOString();
    const defaultValidUntil = endOfWeek();

    let totalPrices = 0;
    let totalPromotions = 0;
    const failed: string[] = [];

    for (const chain of CHAINS) {
      try {
        // fonte oficial
        const { data: source } = await supabaseAdmin
          .from("price_sources")
          .upsert(
            {
              name: chain.name,
              source_type: "official_site",
              base_url: `https://www.${chain.domain}`,
              is_active: true,
            },
            { onConflict: "name" },
          )
          .select("id")
          .single();

        const offersUrl = await findOffersUrl(chain, city);
        if (!offersUrl) {
          failed.push(chain.name);
          continue;
        }

        const offers = await scrapeOffers(offersUrl);
        if (!offers.length) {
          failed.push(chain.name);
          await supabaseAdmin
            .from("price_sources")
            .update({ last_run_at: collectedAt, last_status: "sem ofertas publicadas" })
            .eq("id", source?.id ?? "");
          continue;
        }

        // mercado + unidade na cidade
        const { data: store } = await supabaseAdmin
          .from("stores")
          .upsert(
            { name: chain.name, chain: chain.name, website: `https://www.${chain.domain}` },
            { onConflict: "name" },
          )
          .select("id")
          .single();
        if (!store) continue;

        const { data: existingLoc } = await supabaseAdmin
          .from("store_locations")
          .select("id")
          .eq("store_id", store.id)
          .eq("city", city)
          .maybeSingle();

        let locationId = existingLoc?.id;
        if (!locationId) {
          const { data: created } = await supabaseAdmin
            .from("store_locations")
            .insert({
              store_id: store.id,
              label: `${chain.name} — ${city}`,
              city,
              state: data.state ?? null,
              lat: data.lat ?? null,
              lng: data.lng ?? null,
            })
            .select("id")
            .single();
          locationId = created?.id;
        }
        if (!locationId) continue;

        // substitui a coleta anterior desta loja/fonte
        await supabaseAdmin
          .from("product_prices")
          .delete()
          .eq("store_location_id", locationId)
          .eq("source_id", source!.id);
        await supabaseAdmin
          .from("promotions")
          .delete()
          .eq("store_location_id", locationId)
          .eq("source_id", source!.id);

        for (const offer of offers.slice(0, 40)) {
          const name = offer.product_name!.trim().slice(0, 160);
          const { data: existingProduct } = await supabaseAdmin
            .from("products")
            .select("id")
            .ilike("name", name)
            .maybeSingle();

          let productId = existingProduct?.id;
          if (!productId) {
            const { data: createdProduct } = await supabaseAdmin
              .from("products")
              .insert({
                name,
                package_qty: offer.quantity ?? null,
                unit: normalizeUnit(offer.unit),
              })
              .select("id")
              .single();
            productId = createdProduct?.id;
          }
          if (!productId) continue;

          const validUntil = offer.valid_until
            ? (new Date(offer.valid_until).toString() === "Invalid Date"
                ? defaultValidUntil
                : new Date(offer.valid_until).toISOString())
            : defaultValidUntil;

          await supabaseAdmin.from("product_prices").insert({
            product_id: productId,
            store_location_id: locationId,
            price: offer.price!,
            quantity: 1,
            unit: normalizeUnit(offer.unit),
            source_id: source!.id,
            source_url: offersUrl,
            collected_at: collectedAt,
            valid_until: validUntil,
            is_promotion: true,
          });
          totalPrices += 1;

          await supabaseAdmin.from("promotions").insert({
            product_id: productId,
            store_location_id: locationId,
            title: name,
            promo_price: offer.price!,
            regular_price: offer.regular_price ?? null,
            starts_at: collectedAt,
            ends_at: validUntil,
            source_id: source!.id,
            source_url: offersUrl,
            collected_at: collectedAt,
          });
          totalPromotions += 1;
        }

        await supabaseAdmin
          .from("price_sources")
          .update({ last_run_at: collectedAt, last_status: `ok (${offers.length} ofertas)` })
          .eq("id", source!.id);
      } catch (err) {
        console.error(`Coleta falhou em ${chain.name}:`, err);
        failed.push(chain.name);
      }
    }

    if (totalPrices === 0) {
      return {
        status: "empty" as const,
        collected: 0,
        message: `Não encontramos ofertas publicadas para ${city} nos sites dos mercados agora. Tente novamente mais tarde.`,
      };
    }

    return {
      status: "ok" as const,
      collected: totalPrices,
      message:
        `${totalPromotions} promoções da semana coletadas dos sites oficiais em ${city}.` +
        (failed.length ? ` Sem ofertas de: ${[...new Set(failed)].join(", ")}.` : ""),
    };
  });

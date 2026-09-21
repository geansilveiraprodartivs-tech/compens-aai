import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Ponto de integração com as fontes REAIS de preço.
 *
 * Nenhum preço é inventado aqui. A coleta só acontece quando uma fonte oficial
 * (site do supermercado, loja online, página de ofertas, encarte ou API/feed)
 * estiver cadastrada em `price_sources` e tiver um coletor associado.
 *
 * Para plugar uma fonte real:
 *   1. cadastre a linha em `price_sources` (nome, tipo, base_url);
 *   2. implemente o coletor em `collectors` abaixo, devolvendo linhas para
 *      `product_prices` / `promotions` com fonte, URL, data da coleta e validade.
 */
type Collector = () => Promise<{ prices: number; promotions: number }>;

const collectors: Record<string, Collector> = {
  // "nome-da-fonte": async () => ({ prices: 0, promotions: 0 }),
};

export const refreshPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: sources, error } = await context.supabase
      .from("price_sources")
      .select("id, name, source_type, base_url, last_run_at, last_status")
      .eq("is_active", true);

    if (error) throw new Error(error.message);

    if (!sources || sources.length === 0) {
      return {
        status: "no_sources" as const,
        collected: 0,
        message:
          "Nenhuma fonte oficial de preços está conectada ainda. Os preços só aparecem quando uma fonte real (site, encarte ou API do supermercado) for cadastrada.",
      };
    }

    const pending = sources.filter((s) => !collectors[s.name]);
    if (pending.length === sources.length) {
      return {
        status: "no_collector" as const,
        collected: 0,
        message: `Fontes cadastradas (${sources
          .map((s) => s.name)
          .join(", ")}), mas ainda sem acesso liberado para coleta. Nenhum preço estimado foi criado.`,
      };
    }

    let prices = 0;
    let promotions = 0;
    for (const source of sources) {
      const run = collectors[source.name];
      if (!run) continue;
      const result = await run();
      prices += result.prices;
      promotions += result.promotions;
    }

    return {
      status: "ok" as const,
      collected: prices,
      message: `${prices} preços e ${promotions} promoções atualizados a partir das fontes oficiais.`,
    };
  });

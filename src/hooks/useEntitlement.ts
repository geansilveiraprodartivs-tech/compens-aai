import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { openCheckout } from "@/lib/checkout";
import { createCheckoutLink, getEntitlement } from "@/lib/subscription.functions";
import type { PlanId } from "@/lib/entitlement";

/**
 * Estado de acesso do usuário, sempre calculado no servidor.
 * Revalida ao voltar para o app (caso o usuário acabou de pagar) e a cada minuto.
 */
export function useEntitlement() {
  const fetchEntitlement = useServerFn(getEntitlement);
  return useQuery({
    queryKey: ["entitlement"],
    queryFn: () => fetchEntitlement(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    retry: 1,
  });
}

export function useSubscribe() {
  const qc = useQueryClient();
  const createLink = useServerFn(createCheckoutLink);

  return useMutation({
    mutationFn: async (plan: PlanId) => {
      const result = await createLink({ data: { plan } });
      await openCheckout(result.url);
      return result;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["entitlement"] });
    },
  });
}

/** Botão "Já paguei": força uma nova consulta ao servidor. */
export function useRefreshEntitlement() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["entitlement"] });
}

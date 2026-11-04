import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPhoneVerification } from "@/lib/phoneVerification.functions";
import type { PhoneStatus } from "@/lib/phoneVerification";

/** Chave única do estado do celular no cache do React Query. */
export const PHONE_VERIFICATION_QUERY_KEY = ["phone-verification"] as const;

/**
 * Situação do celular (confirmado? pendente? gate ativo?), sempre calculada no
 * servidor. Usada pelo cartão do perfil e pelo gate de confirmação.
 */
export function usePhoneVerificationStatus() {
  const fetchStatus = useServerFn(getPhoneVerification);
  return useQuery<PhoneStatus>({
    queryKey: PHONE_VERIFICATION_QUERY_KEY,
    queryFn: () => fetchStatus(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

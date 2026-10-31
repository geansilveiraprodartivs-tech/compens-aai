import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Entitlement, PlanId } from "@/lib/entitlement";

/**
 * Server functions do controle de acesso. Toda decisão é tomada no servidor e
 * o cliente só recebe o resultado — nada aqui pode ser forjado a partir do
 * navegador para liberar o app.
 */

export const getEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Entitlement> => {
    const { getEntitlementForUser } = await import("@/lib/entitlement.server");
    return getEntitlementForUser(context.userId);
  });

export const createCheckoutLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ plan: z.enum(["monthly", "annual"]) }).parse(input),
  )
  .handler(async ({ context, data }): Promise<{ url: string; plan: PlanId }> => {
    const { createCheckoutLinkForUser } = await import("@/lib/entitlement.server");
    return createCheckoutLinkForUser(context.userId, data.plan);
  });

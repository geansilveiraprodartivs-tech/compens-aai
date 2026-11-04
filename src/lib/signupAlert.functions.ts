import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server function do alerta de novo cadastro.
 *
 * Chamada pelo app depois do login (uma vez por sessão, ver
 * `SignupAlertPing`). O usuário vem do token autenticado, então ninguém
 * consegue disparar alerta com nome/e-mail de outra pessoa.
 *
 * É idempotente (`signup_notified_at`) e nunca lança: qualquer falha vira
 * `{ ok: false }` para não atrapalhar a navegação.
 */
export type NotifySignupResponse = { ok: boolean; reason: string };

export const notifySignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotifySignupResponse> => {
    try {
      const { notifySignupForUser } = await import("@/lib/signupAlert.server");
      const result = await notifySignupForUser(context.userId);
      return { ok: result.ok, reason: result.reason };
    } catch (error) {
      console.error("[CompensAI] falha ao emitir o alerta de novo cadastro:", error);
      return { ok: false, reason: "error" };
    }
  });

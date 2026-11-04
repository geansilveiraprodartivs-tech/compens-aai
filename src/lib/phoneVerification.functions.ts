import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CheckCodeResult, PhoneStatus, SendCodeResult } from "@/lib/phoneVerification";

/**
 * Server functions da confirmação de celular.
 *
 * O usuário vem do token autenticado (`requireSupabaseAuth`), então ninguém
 * consegue confirmar/consultar celular de outra conta. As credenciais da Twilio
 * ficam só no servidor; o cliente recebe apenas o resultado.
 *
 * As ações nunca lançam: devolvem `{ ok: false, reason, message }` para a tela
 * mostrar o motivo exato sem derrubar nada.
 */

export const getPhoneVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PhoneStatus> => {
    try {
      const { getPhoneStatusForUser } = await import("@/lib/phoneVerification.server");
      return await getPhoneStatusForUser(context.userId);
    } catch (error) {
      console.error(
        "[CompensAI] falha ao ler o estado do celular:",
        error instanceof Error ? error.message : error,
      );
      // Falha aberta: erro de leitura nunca bloqueia a conta nem mente sobre
      // uma confirmação que não existe.
      return {
        configured: false,
        required: false,
        gate_applies: false,
        verified: false,
        phone_masked: null,
        verified_at: null,
        pending: false,
        can_resend_in_seconds: 0,
        attempts_remaining: 0,
        missing: [],
      };
    }
  });

export const sendPhoneCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ phone: z.string().trim().min(8).max(30) }).parse(input),
  )
  .handler(async ({ context, data }): Promise<SendCodeResult> => {
    try {
      const { startPhoneVerification } = await import("@/lib/phoneVerification.server");
      return await startPhoneVerification({ userId: context.userId, phone: data.phone });
    } catch (error) {
      console.error(
        "[CompensAI] falha ao pedir código por SMS:",
        error instanceof Error ? error.message : error,
      );
      return {
        ok: false,
        reason: "provider_error",
        message: "Não foi possível enviar o SMS agora. Tente novamente em instantes.",
        retry_after_seconds: null,
        masked_phone: null,
        provider_error: null,
      };
    }
  });

export const checkPhoneCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        phone: z.string().trim().min(8).max(30),
        code: z.string().trim().min(4).max(10),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<CheckCodeResult> => {
    try {
      const { checkPhoneVerification } = await import("@/lib/phoneVerification.server");
      return await checkPhoneVerification({
        userId: context.userId,
        phone: data.phone,
        code: data.code,
      });
    } catch (error) {
      console.error(
        "[CompensAI] falha ao confirmar o código do celular:",
        error instanceof Error ? error.message : error,
      );
      return {
        ok: false,
        verified: false,
        reason: "provider_error",
        message: "Não foi possível confirmar o código agora. Tente novamente em instantes.",
        attempts_remaining: 0,
        retry_after_seconds: null,
        provider_error: null,
      };
    }
  });

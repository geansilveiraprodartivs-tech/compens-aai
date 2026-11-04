import { createFileRoute } from "@tanstack/react-router";
import { handleTwilioStatus } from "@/lib/phoneVerification.server";

/**
 * Diagnóstico da configuração da Twilio.
 *
 * `GET /api/public/twilio-status` responde **se** as variáveis existem e se o
 * formato parece correto — nunca o valor. Com `?live=1` faz um GET no serviço
 * Verify (não envia SMS, não gera custo) para confirmar credencial + Service
 * SID de verdade.
 *
 * Não há POST: este endpoint não envia SMS nem altera conta.
 */
export const Route = createFileRoute("/api/public/twilio-status")({
  server: {
    handlers: {
      GET: async ({ request }) => handleTwilioStatus(request),
    },
  },
});

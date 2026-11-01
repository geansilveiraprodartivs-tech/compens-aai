import { createFileRoute } from "@tanstack/react-router";
import { handleCaktoWebhook, handleCaktoWebhookInfo } from "@/lib/cakto-webhook.server";

/**
 * Endpoint público do webhook da Cakto.
 *
 * Precisa ser uma rota de servidor (e não `createServerFn`) porque a Cakto
 * chama direto da infraestrutura dela, sem o header de CSRF/origem do app.
 */
export const Route = createFileRoute("/api/public/cakto")({
  server: {
    handlers: {
      GET: async () => handleCaktoWebhookInfo(),
      POST: async ({ request }) => handleCaktoWebhook(request),
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { handleCaktoWebhook } from "@/lib/cakto-webhook.server";

/**
 * Endpoint público do webhook da Cakto.
 *
 * Precisa ser uma rota de servidor (e não `createServerFn`) porque a Cakto
 * chama direto da infraestrutura dela, sem o header de CSRF/origem do app.
 */
export const Route = createFileRoute("/api/public/cakto")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ ok: true, endpoint: "cakto" }), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        }),
      POST: async ({ request }) => handleCaktoWebhook(request),
    },
  },
});

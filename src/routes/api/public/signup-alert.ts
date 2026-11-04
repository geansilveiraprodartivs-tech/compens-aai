import { createFileRoute } from "@tanstack/react-router";
import { handleSignupAlertInfo, handleSignupAlertWebhook } from "@/lib/signupAlert.server";

/**
 * Endpoint público do alerta de novo cadastro.
 *
 * Serve para quem quiser ligar o alerta direto no banco (Supabase Database
 * Webhook em `auth.users`), sem depender de a pessoa abrir o app depois do
 * cadastro. Exige o segredo `SIGNUP_ALERT_SECRET` (header
 * `X-Signup-Alert-Secret` ou `Authorization: Bearer ...`); sem ele responde
 * 401 e nada é enviado.
 *
 * Precisa ser rota de servidor (e não `createServerFn`) porque quem chama é a
 * infraestrutura do Supabase, sem o header de CSRF/origem do app.
 */
export const Route = createFileRoute("/api/public/signup-alert")({
  server: {
    handlers: {
      GET: async () => handleSignupAlertInfo(),
      POST: async ({ request }) => handleSignupAlertWebhook(request),
    },
  },
});

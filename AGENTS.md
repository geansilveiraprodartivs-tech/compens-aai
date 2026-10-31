<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

Home-screen installation uses a manifest and CDN-backed PNG icon variants, without a service worker; offline caching is not requested.

The authenticated experience uses a responsive shopping-command-center shell: desktop sidebar and mobile bottom navigation, preserving the same five destinations.

## Git / Push (memorizado)

- Conta GitHub usada para autenticar o push: **`geansilveiraprodartivs-tech`** (github.com/geansilveiraprodartivs-tech, dono do repo `compens-aai`). Não usar outra conta.
- Push via HTTPS + Git Credential Manager: quando o push ficar pendurado, pedir ao usuário para aprovar a janela do GCM (barra de tarefas) / login no navegador; depois retentar `git push origin main`.
- `gh` CLI NÃO instalado; não depender dele.
- Repo usa Bun (não commitar `package-lock.json`).
- Sempre commitar e push sem perguntar (a menos que o usuário peça o contrário).

## Acesso: trial de 48h + assinaturas Cakto

- Regras puras em `src/lib/entitlement.ts` (planos, preços, trial, token de callback, mapeamento de eventos) — testadas em `node scripts/subscription.test.ts`.
- Estado no servidor em `src/lib/entitlement.server.ts`, gravado em `auth.users.app_metadata.compensai` via service role (`getEntitlementForUser`, `assertPremium`, `applyCaktoEvent`). `assertPremium` é chamado dentro de `nutrition|photo|offers|prices.functions.ts` — nunca importar esse arquivo do topo de um `*.functions.ts`.
- Server functions: `src/lib/subscription.functions.ts` (`getEntitlement`, `createCheckoutLink`). Gate/overlay: `src/components/SubscriptionGate.tsx` montado em `src/routes/_authenticated/route.tsx`; faixa de trial no `AppShell`; seção "Meu plano" no perfil.
- Webhook: `POST /api/public/cakto` (`src/routes/api/public/cakto.ts` → `src/lib/cakto-webhook.server.ts`). Valida `X-Cakto-Signature` (HMAC-SHA256 de `{timestamp}.{corpo cru}`), tolerância de 5 min, compara também `secret` do corpo, deduplica por `id` do pedido.
- **Dependência de configuração**: sem `CAKTO_WEBHOOK_SECRET` (Lovable Secrets) o webhook responde 401 e nada é liberado. URL a cadastrar no painel Cakto: `https://compens-aai.lovable.app/api/public/cakto` (eventos de compra, reembolso, chargeback e assinatura). O checkout leva `?callback=<token assinado>` para ligar o pagamento ao usuário.
- Limite conhecido: o bloqueio é de UI + server functions. Listas/comparações vão direto ao Supabase com RLS; negar em nível de banco exigiria policy baseada em `auth.jwt()->'app_metadata'->'compensai'` (migração não aplicada de propósito, para não travar contas em produção sem teste).

## Pendência

- Guia de build local do APK Android (plugin `BankApps` já no repo) — usuário pediu para deixar para depois.

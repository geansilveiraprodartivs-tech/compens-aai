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

- Regras puras em `src/lib/entitlement.ts` (planos, preços, trial, token de callback, mapeamento de eventos, log de eventos, resumo de "Meu plano") — testadas em `node scripts/subscription.test.ts`.
- Estado no servidor em `src/lib/entitlement.server.ts`, gravado em `auth.users.app_metadata.compensai` via service role (`getEntitlementForUser`, `assertPremium`, `applyCaktoEvent`). **Nenhuma DDL**: trial, assinatura, último pagamento, `processed_events` (dedupe) e `events` (auditoria, máx. 50) ficam no mesmo objeto, sem PII do comprador. `assertPremium` é chamado dentro de `nutrition|photo|offers|prices.functions.ts` — nunca importar esse arquivo do topo de um `*.functions.ts`.
- Server functions: `src/lib/subscription.functions.ts` (`getEntitlement`, `createCheckoutLink`). Gate/overlay: `src/components/SubscriptionGate.tsx` montado em `src/routes/_authenticated/route.tsx`; faixa de trial no `AppShell`; seção "Meu plano" (plano, situação, validade, tipo de acesso) no perfil.
- Webhook: `POST /api/public/cakto` (`src/routes/api/public/cakto.ts` → `src/lib/cakto-webhook.server.ts`) e `GET` de verificação (`{"ok":true,"endpoint":"cakto"}`). O POST exige `X-Cakto-Timestamp` + `X-Cakto-Signature` (`v1=HMAC-SHA256(secret, "{timestamp}.{corpo cru}")`, tolerância de 5 min, aceita múltiplas assinaturas separadas por vírgula), compara também o `secret` do corpo e falha fechado sem segredo. Dedupe por `id`/`refId` do pedido; `data` pode vir como lista (webhook V2).
- Eventos: `purchase_approved`/`subscription_created`/`subscription_renewed`/`subscription_late_recovered` liberam o plano (mensal 30 d, anual 365 d, somando ao período restante); `refund`/`chargeback` revogam na hora; `subscription_canceled` mantém até o fim do período pago; `subscription_late`/`subscription_renewal_refused` marcam atraso (acesso só até o vencimento); `subscription_paused` suspende e `subscription_resumed` reativa; `purchase_refused` e demais eventos apenas registram; eventos de ruído (`checkout_abandonment`, `*_gerado`, `initiate_checkout`, `purchase_email_failed`) respondem 2xx sem tocar em contas. Falha de gravação responde 500 para a Cakto reenviar (dedupe protege).
- **Plano do pagamento**: `CAKTO_PLAN_MAP` (JSON em Secrets), ex. `{"products":{"<id-anual>":"annual"},"offers":{"<id-mensal>":"monthly"}}`. ID mapeado é a fonte da verdade; sem mapa, tenta nome do produto/oferta e, por último, valor em BRL. Sem correspondência o evento vira `unmapped`, **não libera acesso** e não é marcado como processado (reenvio após configurar o mapa aplica).
- **Dependência de configuração**: sem `CAKTO_WEBHOOK_SECRET` (Lovable Secrets) o webhook responde 401 e nada é liberado. URL a cadastrar no painel Cakto: `https://compens-aai.lovable.app/api/public/cakto` (eventos de compra, reembolso, chargeback e assinatura). O checkout leva `?callback=<token assinado>` para ligar o pagamento ao usuário. Testes do endpoint: `node scripts/caktoWebhook.test.ts`.
- Limite conhecido: o bloqueio é de UI + server functions. Listas/comparações vão direto ao Supabase com RLS; negar em nível de banco exigiria policy baseada em `auth.jwt()->'app_metadata'->'compensai'` (migração não aplicada de propósito, para não travar contas em produção sem teste). A gravação usa lock em memória por usuário + `rev` com releitura/retry; entre isolamentos diferentes do servidor a garantia é a dedupe, não uma transação real (exigiria RPC/DDL).

## Alerta de novo cadastro (e-mail + WhatsApp)

- Pedido do dono do app: a cada cadastro novo, avisar **simultaneamente** por e-mail (`compens.aai@gmail.com`) e WhatsApp (`+55 51 98583-9571`), com **nome** e **e-mail** da pessoa.
- Módulo puro `src/lib/signupAlert.ts` (sem imports, testável): `buildSignupAlert` (assunto/texto/HTML/WhatsApp), `signupAlertChannels` (canais a partir do env), `deliverSignupAlert` (`fetch` injetável, e-mail e WhatsApp em paralelo, nunca lança). Destinatários fixos: `SIGNUP_ALERT_EMAIL_TO` / `SIGNUP_ALERT_WHATSAPP_TO`.
- Provedores: **e-mail** via Resend (`RESEND_API_KEY`, `SIGNUP_ALERT_FROM`); **WhatsApp** via CallMeBot (`CALLMEBOT_API_KEY`, `CALLMEBOT_PHONE`) ou Meta Cloud API (`WHATSAPP_CLOUD_TOKEN` + `WHATSAPP_CLOUD_PHONE_ID`, `WHATSAPP_ALERT_TO`) — Cloud tem prioridade. Canal sem credencial é `skipped`; nada quebra.
- Servidor `src/lib/signupAlert.server.ts` (lazy import do Supabase, padrão do webhook Cakto): `notifySignupForUser` lê o cadastro no `auth.users` com a service role (nome/e-mail **nunca** vêm do cliente), respeita `SIGNUP_ALERT_MAX_AGE_HOURS` (padrão 168h) e grava `signup_notified_at` no mesmo objeto `compensai` do `app_metadata` (**sem DDL**) só quando algum canal entregou.
- Entradas: (1) server fn `notifySignup` (`src/lib/signupAlert.functions.ts`) chamada uma vez por sessão pelo `SignupAlertPing` no `AppShell` — cobre cadastro por e-mail, Google e confirmação de e-mail; (2) rota pública `POST /api/public/signup-alert` (`src/routes/api/public/signup-alert.ts`) para Supabase Database Webhook, fail-closed com `SIGNUP_ALERT_SECRET` (`X-Signup-Alert-Secret` ou `Authorization: Bearer`). O `GET` é diagnóstico: `{"ok":true,"endpoint":"signup-alert","channels":{"email":"resend|false","whatsapp":"callmebot|whatsapp_cloud|false"},"webhook_protected":bool,"max_age_hours":168}` — mostra **se** cada canal está configurado, nunca a credencial.
- Testes: `node scripts/signupAlert.test.ts` (mensagens, canais por env, entrega/paralelismo/falhas, idempotência, janela de idade, webhook 401/400/404/200).
- Limite: sem credencial configurada o alerta fica `no_channel` (log de aviso). O Resend em `onboarding@resend.dev` só entrega para o e-mail dono da conta Resend; para outros remetentes é preciso domínio verificado.

## Confirmação de celular por SMS (Twilio Verify)

- Objetivo: um trial de 48h por celular confirmado. O `roadmap.md` previa SMS; a auditoria mostrou que **nenhum código Twilio existia** (nem no histórico) — esta é a implementação inicial, com o gate **desligado por padrão**.
- Usa **somente Twilio Verify V2** (`POST /v2/Services/{sid}/Verifications`, `POST .../VerificationCheck`, `GET .../Services/{sid}`). Nada de Programmable Messaging: o código é gerado/validado pela Twilio e **nunca** é criado, guardado ou comparado do nosso lado.
- Módulo puro `src/lib/phoneVerification.ts`: `parsePhone` (E.164, celular BR = DDD + 9), `maskPhone`, `readPhoneState`, `evaluateSend` (reenvio a cada 60 s, teto de 5/hora por conta), `evaluateCheck` (código vale 10 min, 5 tentativas, bloqueio de 15 min), redutores de estado, `phoneVerificationRequired` / `phoneGateApplies`.
- Servidor `src/lib/phoneVerification.server.ts` (deps injetáveis, mesmo padrão do alerta de cadastro): `readTwilioConfig`, `mapTwilioError`, `startPhoneVerification`, `checkPhoneVerification`, `getPhoneStatusForUser`, `handleTwilioStatus`. Logs mostram só `kind`/código/mensagem saneada — nunca token, SID inteiro ou telefone completo.
- **SEM UI (removido em 2026-11-06)**: `PhoneVerificationCard`, `PhoneVerificationGate`, `usePhoneVerification.ts` e as server functions `phoneVerification.functions.ts` (`getPhoneVerification`, `sendPhoneCode`, `checkPhoneCode`) foram **apagados**. O app não oferece mais nenhum caminho de envio de SMS: nada no Perfil, nenhum overlay, nenhum botão de reenviar, nenhum aviso de celular pendente. Login (e-mail e Google), cadastro sem telefone e trial de 48h **não** dependem de telefone — o fluxo nunca é bloqueado pela falta de confirmação.
- O backend Twilio permanece no repositório apenas como diagnóstico/uso futuro: `src/lib/phoneVerification.ts`, `src/lib/phoneVerification.server.ts` e `src/routes/api/public/twilio-status.ts`. Nenhum import de UI aponta para eles. Não há envio de SMS acionável por API (as server functions autenticadas foram removidas).
- Estado histórico em `auth.users.app_metadata.compensai_phone` (**chave separada do billing `compensai`**, gravada só com service role, **sem DDL**): `phone`, `verified_at`, `last_sent_at`, `sends[]`, `attempts`, `locked_until`. **Dados existentes foram preservados** (nada apagado no banco). Escritas com lock por usuário em memória.
- **Gate desligado** (`PHONE_VERIFICATION_REQUIRED` irrelevante: `gate_required: false` e nenhuma UI lê esse valor). Se algum dia for religado, exige reimplementar a UI.
- Secrets (backend, nunca no frontend/GitHub): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` **ou** `TWILIO_API_KEY` + `TWILIO_API_KEY_SECRET` (par tem prioridade), `TWILIO_VERIFY_SERVICE_SID` (aliases `TWILIO_VERIFY_SERVICE`/`TWILIO_SERVICE_SID`), `PHONE_VERIFICATION_REQUIRED`.
- Diagnóstico sem enviar SMS: `GET /api/public/twilio-status` mostra **se** cada variável existe/está no formato (nunca o valor); `?live=1` faz `GET` no serviço Verify para confirmar credencial + Service SID. Erros da Twilio mais tratados: 20003 (credencial), 20404 (serviço), 21211/21604/21606/60200 (número), 21614 (fixo), 21608 (número não autorizado na conta trial), 21408 (região), 21610 (bloqueado), 60202/60203/20429 (tentativas/limite).
- Testes: `node scripts/phoneVerification.test.ts` (90 casos: número/E.164, máscara, envio aceito, cooldown, teto por hora, código errado, bloqueio, expiração, reuso, celular de outra conta, erros mapeados sem vazar segredo, diagnóstico, gate só em trial).
- Limites: sem DDL não há unicidade atômica de celular entre contas (hoje é deterrente por varredura `listUsers`); a unicidade real exige tabela + índice único (SQL apresentado, aguardando autorização). Envio/entrega real depende de credenciais nas Secrets, número autorizado na conta Twilio e publicação pelo Lovable — até lá o `?live=1` é a única prova de conexão.

## Pendência

- Guia de build local do APK Android (plugin `BankApps` já no repo) — usuário pediu para deixar para depois.

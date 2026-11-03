/**
 * Oferta do teste gratuito de 48 horas mostrada na página inicial (antes do
 * login) e o formato do link de cadastro.
 *
 * Módulo PURO e autocontido (sem imports) para poder ser usado pela landing,
 * pela tela de cadastro e pelos testes com `node scripts/trialOffer.test.ts`.
 *
 * IMPORTANTE: aqui não existe NENHUMA decisão de acesso. Quem decide se o trial
 * vale é `src/lib/entitlement.ts` (`TRIAL_HOURS` + `computeEntitlement`), com o
 * relógio do servidor e o `trial_started_at` gravado em `app_metadata` — nunca
 * reiniciado por logout/login. Este arquivo só descreve o que a pessoa vê.
 */

/** Horas do trial. Precisa ser igual a `TRIAL_HOURS` de `entitlement.ts`. */
export const TRIAL_OFFER_HOURS = 48;

const HOURS_LABEL = `${TRIAL_OFFER_HOURS} horas`;

export const TRIAL_OFFER = {
  badge: `Teste grátis · ${HOURS_LABEL}`,
  title: `Experimente o CompensAI gratuitamente por ${HOURS_LABEL}!`,
  body: `Tenha acesso a todas as funcionalidades do aplicativo durante ${HOURS_LABEL} e descubra como é mais fácil cuidar da sua alimentação, organizar suas compras e acompanhar seus objetivos.`,
  note: "Teste grátis, sem limitações de funcionalidades durante o período de avaliação.",
  emailCta: "Criar cadastro com e-mail e senha",
  googleCta: "Continuar com Google",
  signupHint: "Crie a conta agora e comece a usar em segundos.",
  existingAccountLabel: "Já tenho uma conta?",
  existingAccountCta: "Entrar",
} as const;

/** Com o que a pessoa conta durante o período (só o que o app já faz). */
export const TRIAL_OFFER_BENEFITS: readonly string[] = [
  `Todas as funcionalidades liberadas por ${HOURS_LABEL}`,
  "Lista de compras, comparador, economia e análise de alimentos",
  "Depois do período, você escolhe se quer assinar",
];

/* ------------------------------------------------ cadastro (link e modo) */

/**
 * Chave de busca que abre a tela `/auth` direto no cadastro, para o botão da
 * landing não cair no login (/auth?modo=cadastro).
 */
export const SIGNUP_SEARCH_KEY = "modo";
export const SIGNUP_SEARCH_VALUE = "cadastro";

export type AuthMode = "signin" | "signup" | "reset";

export type AuthSearch = { modo?: typeof SIGNUP_SEARCH_VALUE };

/** Link de cadastro usado pelos botões "Criar cadastro". */
export function signupSearch(): AuthSearch {
  return { modo: SIGNUP_SEARCH_VALUE };
}

/** Lê `?modo=` de qualquer formato e devolve o modo inicial da tela. */
export function authModeFromSearch(search: unknown): AuthMode {
  const raw =
    search && typeof search === "object" && !Array.isArray(search)
      ? (search as Record<string, unknown>)[SIGNUP_SEARCH_KEY]
      : undefined;
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === SIGNUP_SEARCH_VALUE || value === "signup" || value === "cadastro") return "signup";
  if (value === "reset" || value === "recuperar" || value === "recuperar-senha") return "reset";
  return "signin";
}

/* ---------------------------------------- mesma caixa de e-mail (antiabuso) */

const SAME_MAILBOX_DOMAINS: ReadonlySet<string> = new Set(["gmail.com", "googlemail.com"]);

/**
 * Forma canônica do e-mail para reconhecer a MESMA caixa de entrada:
 *
 * - `Fulano@Exemplo.com` → `fulano@exemplo.com`
 * - `fulano+teste2@gmail.com` → `fulano@gmail.com`
 * - `fu.lano@gmail.com` → `fulano@gmail.com` (o Gmail ignora pontos)
 * - `fu.lano@exemplo.com` → `fu.lano@exemplo.com` (pontos só somem no Gmail)
 *
 * Serve para o cadastro não criar uma segunda conta (e um segundo teste grátis)
 * para a mesma caixa usando apelidos. Não é decisão de acesso: é uma trava de
 * cadastro. Valor inválido vira `""` (e não trava nada).
 */
export function normalizeSignupEmail(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw || raw.length > 254) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw)) return "";

  const at = raw.lastIndexOf("@");
  if (at <= 0) return "";

  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  const plus = local.indexOf("+");
  let mailbox = plus > 0 ? local.slice(0, plus) : local;
  if (SAME_MAILBOX_DOMAINS.has(domain)) mailbox = mailbox.replace(/\./g, "");
  if (!mailbox) return "";
  return `${mailbox}@${domain}`;
}

/** Os dois e-mails são a mesma caixa de entrada? */
export function isSameSignupMailbox(a: unknown, b: unknown): boolean {
  const left = normalizeSignupEmail(a);
  if (!left) return false;
  return left === normalizeSignupEmail(b);
}

/** Mensagem única de bloqueio (usada na tela de cadastro). */
export const SIGNUP_ALREADY_EXISTS_MESSAGE =
  "Já existe uma conta com este e-mail (ou um apelido dele). Entre com sua senha para continuar.";

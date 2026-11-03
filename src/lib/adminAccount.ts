/**
 * Contas administrativas do CompensAI (donas do app).
 *
 * Módulo PURO e autocontido (sem imports) para poder ser usado no servidor e
 * testado com `node scripts/adminAccount.test.ts`.
 *
 * O selo é decidido SEMPRE no servidor: `getEntitlementForUser` compara o
 * e-mail da conta autenticada com esta lista e, quando bate, aplica
 * `grantAdminAccess` (acesso premium vitalício). O navegador só recebe o
 * resultado (`entitlement.admin`), nunca a lista — ninguém consegue "virar
 * administrador" mexendo no front-end.
 *
 * Não é preciso gravar nada no banco: basta a conta existir com um destes
 * e-mails. Tirar do app = remover a linha desta lista.
 */

/** E-mails donos do app. Comparados pela caixa de entrada (ver abaixo). */
export const ADMIN_ACCOUNT_EMAILS: readonly string[] = ["geansilveiraprodartivs@gmail.com"];

const FREE_MAILBOX_DOMAINS: ReadonlySet<string> = new Set(["gmail.com", "googlemail.com"]);

/**
 * Forma canônica do e-mail para comparar contas, igual à usada na trava de
 * cadastro: minúsculas, sem apelido `+tag` e, no Gmail, sem pontos.
 *
 * Assim `Gean.SilveiraProdArtivs+adm@Gmail.com` casa com a conta configurada
 * (é a mesma caixa de entrada), enquanto um endereço diferente continua sendo
 * outra pessoa. Valor inválido vira `""` (e não vira administrador).
 */
export function normalizeAccountEmail(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw || raw.length > 254) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw)) return "";

  const at = raw.lastIndexOf("@");
  if (at <= 0) return "";

  const local = raw.slice(0, at);
  const rawDomain = raw.slice(at + 1);
  // googlemail.com e gmail.com são a mesma caixa de entrada no Google.
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  const plus = local.indexOf("+");
  let mailbox = plus > 0 ? local.slice(0, plus) : local;
  if (FREE_MAILBOX_DOMAINS.has(domain)) mailbox = mailbox.replace(/\./g, "");
  if (!mailbox) return "";
  return `${mailbox}@${domain}`;
}

/** Esta conta é administradora do app? */
export function isAdminEmail(value: unknown): boolean {
  const target = normalizeAccountEmail(value);
  if (!target) return false;
  return ADMIN_ACCOUNT_EMAILS.some((email) => normalizeAccountEmail(email) === target);
}

/** Textos do selo premium mostrado no perfil e no cabeçalho do app. */
export const PREMIUM_ACCOUNT = {
  badge: "Premium",
  role: "Fundador",
  title: "Conta administrativa",
  body: "Acesso premium vitalício: todas as funcionalidades liberadas, sem mensalidade e sem prazo.",
  perks: [
    "Todas as funcionalidades liberadas",
    "Sem cobrança e sem prazo",
    "Selo Premium exclusivo no perfil",
  ],
} as const;

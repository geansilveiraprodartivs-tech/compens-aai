import { Check, Crown } from "lucide-react";
import { PREMIUM_ACCOUNT } from "@/lib/adminAccount";

/**
 * Selo de conta premium/administradora do CompensAI.
 *
 * O visual é proposital e diferente do resto do app: medalhão dourado (âmbar)
 * com coroa, para o selo ser reconhecido de longe como "isto é premium", sobre
 * o verde neon do CompensAI. Nada aqui decide acesso — quem decide é o servidor
 * (`entitlement.admin`).
 */

function GoldMedal({ size = 64 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="drop-shadow-[0_8px_18px_rgba(245,190,80,0.35)]"
      >
        <defs>
          <linearGradient id="premium-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff3c4" />
            <stop offset="38%" stopColor="#ffd977" />
            <stop offset="68%" stopColor="#e8a93a" />
            <stop offset="100%" stopColor="#b9771d" />
          </linearGradient>
          <linearGradient id="premium-ring" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffe9a8" />
            <stop offset="100%" stopColor="#c2841f" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="47" fill="url(#premium-ring)" />
        <circle cx="50" cy="50" r="40" fill="url(#premium-gold)" />
        <circle
          cx="50"
          cy="50"
          r="34"
          fill="none"
          stroke="rgba(120,72,10,0.35)"
          strokeWidth="1.5"
          strokeDasharray="3 4"
        />
        {/* Coroa estilizada desenhada à mão para ficar nítida em qualquer tamanho */}
        <path
          d="M33 62h34l-3.4-21-8.1 7.4L50 36l-5.5 12.4-8.1-7.4L33 62Z"
          fill="#6b4308"
          opacity="0.85"
        />
        <path d="M33 59.5h34l-3.4-21-8.1 7.4L50 33.5l-5.5 12.4-8.1-7.4-3.4 21Z" fill="#fff8dc" />
        <circle cx="50" cy="30" r="2.6" fill="#fffdf0" />
        <circle cx="31.6" cy="35" r="2.1" fill="#fffdf0" />
        <circle cx="68.4" cy="35" r="2.1" fill="#fffdf0" />
      </svg>
    </span>
  );
}

/** Selo compacto (cabeçalho, listas). */
export function PremiumChip({ className = "" }: { className?: string }) {
  return (
    <span
      title={PREMIUM_ACCOUNT.title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/50 bg-amber-300/15 px-2 py-0.5 text-[10px] font-extrabold uppercase leading-none tracking-wide text-amber-200 ${className}`.trim()}
    >
      <Crown className="size-3" aria-hidden="true" />
      {PREMIUM_ACCOUNT.badge}
    </span>
  );
}

/**
 * Cartão completo do perfil: medalhão dourado + selo Premium + o que está
 * liberado. Mostrado apenas quando `entitlement.admin` é verdadeiro.
 */
export function PremiumCard({ className = "" }: { className?: string }) {
  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-amber-300/45 bg-gradient-to-br from-amber-300/18 via-card to-card p-4 shadow-[0_20px_60px_-30px_rgba(245,190,80,0.55)] ${className}`.trim()}
      aria-label={PREMIUM_ACCOUNT.title}
    >
      <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-amber-300/20 blur-3xl" />
      <div className="relative flex items-center gap-3.5">
        <GoldMedal size={62} />
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-200 to-amber-400 px-2.5 py-1 text-[10px] font-extrabold uppercase leading-none tracking-[0.14em] text-amber-950">
            <Crown className="size-3" aria-hidden="true" />
            {PREMIUM_ACCOUNT.badge}
          </span>
          <p className="mt-1.5 truncate font-display text-base font-extrabold leading-tight text-amber-100">
            {PREMIUM_ACCOUNT.title}
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200/80">
            {PREMIUM_ACCOUNT.role} · CompensAI
          </p>
        </div>
      </div>

      <p className="relative mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
        {PREMIUM_ACCOUNT.body}
      </p>

      <ul className="relative mt-3 grid gap-1.5">
        {PREMIUM_ACCOUNT.perks.map((perk) => (
          <li
            key={perk}
            className="flex items-start gap-2 text-[12px] leading-snug text-foreground/85"
          >
            <Check className="mt-0.5 size-3.5 shrink-0 text-amber-300" aria-hidden="true" />
            <span>{perk}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

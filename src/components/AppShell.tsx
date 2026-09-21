import { Link } from "@tanstack/react-router";
import { Home, ShoppingCart, Scale, PiggyBank, User, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { useProfile } from "@/hooks/useProfile";

const NAV = [
  { to: "/app", label: "Início", icon: Home },
  { to: "/lista", label: "Lista", icon: ShoppingCart },
  { to: "/comparar", label: "Comparar", icon: Scale },
  { to: "/economia", label: "Economia", icon: PiggyBank },
  { to: "/perfil", label: "Perfil", icon: User },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { data: profile } = useProfile();

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-20 glass rounded-none border-x-0 border-t-0 px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Brand size={36} />
          <Link
            to="/perfil"
            className="flex max-w-[45%] items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs text-muted-foreground"
          >
            <MapPin className="size-3.5 shrink-0 text-accent" />
            <span className="truncate">{profile?.location_label ?? "Definir local"}</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 glass rounded-none border-x-0 border-b-0 px-2 py-2">
        <ul className="mx-auto flex max-w-2xl items-center justify-between">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <Link
                to={to}
                activeProps={{ className: "text-foreground" }}
                inactiveProps={{ className: "text-muted-foreground" }}
                className="flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] transition-colors"
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={
                        isActive
                          ? "gradient-brand glow rounded-xl p-2 text-primary-foreground"
                          : "rounded-xl p-2"
                      }
                    >
                      <Icon className="size-4" />
                    </span>
                    {label}
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

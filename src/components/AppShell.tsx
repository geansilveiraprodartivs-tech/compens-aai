import { Link } from "@tanstack/react-router";
import { Home, ShoppingCart, Scale, PiggyBank, User, MapPin, QrCode } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { useProfile } from "@/hooks/useProfile";

const NAV = [
  { to: "/app", label: "Início", icon: Home },
  { to: "/lista", label: "Lista", icon: ShoppingCart },
  { to: "/comparar", label: "Comparar", icon: Scale },
  { to: "/economia", label: "Economia", icon: PiggyBank },
  { to: "/pix", label: "Pagar", icon: QrCode },
  { to: "/perfil", label: "Perfil", icon: User },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { data: profile } = useProfile();

  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Brand size={34} />
          <Link
            to="/perfil"
            className="flex max-w-[45%] items-center gap-1.5 rounded-lg border border-border bg-secondary/60 px-3 py-1.5 text-xs text-muted-foreground"
          >
            <MapPin className="size-3.5 shrink-0 text-accent" />
            <span className="truncate">{profile?.location_label ?? "Definir local"}</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl md:grid md:min-h-screen md:grid-cols-[230px_1fr] md:gap-6 md:p-6">
        <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] flex-col rounded-xl border border-sidebar-border bg-sidebar p-5 md:flex">
          <Brand size={40} />
          <nav className="mt-10 space-y-2">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeProps={{ className: "bg-sidebar-accent text-primary" }}
                inactiveProps={{ className: "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground" }}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition-colors"
              >
                <Icon className="size-4" /> {label}
              </Link>
            ))}
          </nav>
          <Link to="/perfil" className="mt-auto rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-3 text-xs text-sidebar-foreground/70">
            <span className="flex items-center gap-2 font-semibold text-sidebar-foreground"><MapPin className="size-4 text-primary" /> Minha localização</span>
            <span className="mt-1 block truncate">{profile?.location_label ?? "Definir local"}</span>
          </Link>
        </aside>

        <main className="w-full px-4 py-5 md:min-w-0 md:px-0 md:py-2">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-2 py-2 backdrop-blur-xl md:hidden">
        <ul className="mx-auto flex max-w-2xl items-center justify-between">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <Link
                to={to}
                activeProps={{ className: "text-foreground" }}
                inactiveProps={{ className: "text-muted-foreground" }}
                className="flex min-w-0 items-center justify-center rounded-xl py-1.5 text-[11px] transition-colors"
              >
                {({ isActive }) => (
                  <span className="flex min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap text-center leading-none">
                    <span
                      className={
                        isActive
                          ? "rounded-lg bg-primary p-2 text-primary-foreground"
                          : "rounded-lg p-2"
                      }
                    >
                      <Icon className="size-4 shrink-0" />
                    </span>
                    <span>{label}</span>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

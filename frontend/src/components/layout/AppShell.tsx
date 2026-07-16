import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AjustesDialog } from "./AjustesDialog";
import { ThemeToggle } from "./ThemeToggle";

const NAV_ITEMS = [
  { to: "/", label: "Panel", end: true },
  { to: "/licitaciones", label: "Licitaciones", end: false },
  { to: "/perfil", label: "Perfil de empresa", end: false },
  { to: "/procesos", label: "Procesos", end: false },
];

export function AppShell() {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <span className="shrink-0 text-lg font-semibold">LicitIA</span>
          {/* En pantallas angostas la nav scrollea sola en vez de empujar el header y romper la página. */}
          <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors hover:bg-muted hover:text-foreground",
                    isActive ? "bg-muted text-foreground" : "text-muted-foreground"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <AjustesDialog />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

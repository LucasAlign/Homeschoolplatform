import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useSession, PasswordSettings } from "@/components/session-provider";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { parent, mode, logout } = useSession();

  const navItems = [
    { href: "/", label: "Dashboard" },
    { href: "/work", label: "Daily work" },
    { href: "/students/new", label: "Students" },
    { href: "/courses", label: "Curriculum" },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-6 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-600 shadow-sm">
              <span className="block h-2.5 w-2.5 rounded-[3px] bg-white" />
            </span>
            <span className="text-sm font-bold tracking-tight text-stone-900">
              Homeschool
            </span>
          </Link>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {navItems
              .filter((item) => parent || item.href === "/work")
              .map((item) => {
                const isActive =
                  location === item.href ||
                  (item.href !== "/" && location.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-amber-100 text-amber-800"
                        : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
          </nav>

          <div className="shrink-0">
            {mode === "family" ? (
              <button
                onClick={logout}
                className="rounded-lg px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
              >
                Sign out
              </button>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                Synthetic demo
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <p className="border-b border-amber-100 bg-amber-50 p-3 text-center text-sm text-amber-800">
          Development only: fictional learners and sample work. Production
          access is disabled.
        </p>
        <PasswordSettings />
        {children}
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-6">
          <span className="text-xs font-medium uppercase tracking-wider text-stone-400">
            Curriculum &amp; Lessons
          </span>
          <span className="text-xs font-medium uppercase tracking-wider text-stone-400">
            Structured
          </span>
        </div>
      </footer>
    </div>
  );
}

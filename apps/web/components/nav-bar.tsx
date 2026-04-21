"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth-context";
import { FreshnessBadge } from "./freshness-badge";

const tabs = [
  { href: "/", label: "Map" },
  { href: "/search", label: "Search" },
];

export function NavBar() {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-[1000] border-b border-[#4a3520] bg-[#1a140d]/95 backdrop-blur supports-[backdrop-filter]:bg-[#1a140d]/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-[#f0e4cb]"
        >
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#6b5224] bg-[#c5a572] font-display text-sm font-bold text-[#1a140d] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_2px_0_rgba(0,0,0,0.4)]"
          >
            A
          </span>
          <span className="font-display text-sm font-bold uppercase tracking-[0.18em] text-[#f0e4cb]">
            Amtrak Live
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {tabs.map((t) => {
            const active =
              t.href === "/" ? pathname === "/" : pathname?.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-[#4a3520] text-[#f0e4cb]"
                    : "text-[#a08866] hover:bg-[#2b1f15] hover:text-[#f0e4cb]"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <FreshnessBadge />

        <div className="flex items-center gap-2">
          {loading ? null : user ? (
            <>
              <span className="hidden text-xs text-[#a08866] sm:inline">
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => signOut()}
                className="rounded-md border border-[#4a3520] px-3 py-1.5 text-sm text-[#f0e4cb] hover:border-[#c5a572] hover:text-[#c5a572]"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-sm text-[#f0e4cb] hover:text-[#c5a572]"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-[#c5a572] px-3 py-1.5 text-sm font-medium text-[#1a140d] hover:bg-[#dcb98a]"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

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
    <header className="sticky top-0 z-[1000] border-b border-[#1f2b45] bg-[#0b1220]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0b1220]/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight text-[#e5edf7]"
        >
          <span
            aria-hidden
            className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#3a7afe] text-xs font-bold text-[#0b1220]"
          >
            A
          </span>
          Amtrak Live
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
                    ? "bg-[#1f2b45] text-[#e5edf7]"
                    : "text-[#7b89a1] hover:bg-[#131d31] hover:text-[#e5edf7]"
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
              <span className="hidden text-xs text-[#7b89a1] sm:inline">
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => signOut()}
                className="rounded-md border border-[#1f2b45] px-3 py-1.5 text-sm text-[#e5edf7] hover:border-[#3a7afe] hover:text-[#3a7afe]"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-sm text-[#e5edf7] hover:text-[#3a7afe]"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-[#3a7afe] px-3 py-1.5 text-sm font-medium text-[#0b1220] hover:bg-[#5c92ff]"
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

"use client";

import Link from "next/link";
import { useAuth } from "./auth-context";
import { FreshnessBadge } from "./freshness-badge";
import { FullscreenButton } from "./fullscreen-button";

export function NavBar() {
  const { user, loading, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-[1000] border-b border-[#1c2a3e] bg-[#05080e]/95 backdrop-blur supports-[backdrop-filter]:bg-[#05080e]/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 text-[#d8e4f0]">
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#8ee7f4] bg-[#5ecde0] font-display text-sm font-bold text-[#05080e] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_4px_12px_rgba(94,205,224,0.4)]"
          >
            A
          </span>
          <span className="font-display text-sm font-bold uppercase tracking-[0.18em] text-[#d8e4f0]">
            Amtrak Live
          </span>
        </Link>

        <div className="flex-1" />

        <FullscreenButton />
        <FreshnessBadge />

        <div className="flex items-center gap-2">
          {loading ? null : user ? (
            <>
              <span className="hidden text-xs text-[#5a6d82] sm:inline">
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => signOut()}
                className="rounded-md border border-[#1c2a3e] px-3 py-1.5 text-sm text-[#d8e4f0] hover:border-[#5ecde0] hover:text-[#5ecde0]"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md border border-[#1c2a3e] px-3 py-1.5 text-sm text-[#d8e4f0] hover:border-[#5ecde0] hover:text-[#5ecde0]"
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

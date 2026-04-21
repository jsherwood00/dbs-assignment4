"use client";

import { useEffect, useState } from "react";

export function FullscreenButton() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onChange = () => setActive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Silently ignore — some browsers reject fullscreen from
      // non-user-gesture contexts even though it's a button click.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={active ? "Exit fullscreen" : "Enter fullscreen"}
      title={active ? "Exit fullscreen" : "Enter fullscreen"}
      className="hidden h-8 w-8 items-center justify-center rounded-md border border-[#1c2a3e] text-[#5a6d82] transition-colors hover:border-[#5ecde0] hover:text-[#5ecde0] md:inline-flex"
    >
      {active ? (
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" />
        </svg>
      )}
    </button>
  );
}

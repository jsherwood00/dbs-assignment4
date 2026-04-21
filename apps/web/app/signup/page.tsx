"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const { data, error } = await getSupabase().auth.signUp({
        email,
        password,
      });
      if (error) throw error;
      // With "Confirm email" off, a session is returned immediately.
      if (data.session) {
        router.push("/");
        router.refresh();
      } else {
        // Fallback: user created but not auto-signed in (e.g. email confirmation is on).
        router.push("/login");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-xl border border-[#1f2b45] bg-[#131d31] p-6 shadow-lg"
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#e5edf7]">
            Sign up
          </h1>
          <p className="mt-1 text-sm text-[#7b89a1]">
            Create an account to save station pairs and track your trips.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[#7b89a1]">
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-[#1f2b45] bg-[#0b1220] px-3 py-2 text-sm text-[#e5edf7] outline-none transition-colors placeholder:text-[#4a5a7a] focus:border-[#3a7afe]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[#7b89a1]">
              Password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-[#1f2b45] bg-[#0b1220] px-3 py-2 text-sm text-[#e5edf7] outline-none transition-colors placeholder:text-[#4a5a7a] focus:border-[#3a7afe]"
            />
          </label>
        </div>

        {err ? (
          <div className="rounded-md border border-[#3a2a2a] bg-[#1a1212] px-3 py-2 text-sm text-[#f87171]">
            {err}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-[#3a7afe] px-4 py-2 text-sm font-medium text-[#0b1220] transition-colors hover:bg-[#5c92ff] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>

        <p className="text-center text-sm text-[#7b89a1]">
          Already have an account?{" "}
          <Link href="/login" className="text-[#3a7afe] hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}

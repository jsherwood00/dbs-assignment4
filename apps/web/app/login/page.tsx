"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <AuthForm mode="login" />
    </div>
  );
}

function AuthForm({ mode }: { mode: "login" }) {
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
      const { error } = await getSupabase().auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      router.push("/");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-xl border border-[#1c2a3e] bg-[#0d1520] p-6 shadow-lg"
    >
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#d8e4f0]">
          {mode === "login" ? "Log in" : "Sign up"}
        </h1>
        <p className="mt-1 text-sm text-[#5a6d82]">
          {mode === "login"
            ? "Welcome back — save station pairs to track your trips."
            : "Create an account to save station pairs and track your trips."}
        </p>
      </div>

      <div className="space-y-3">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={setEmail}
        />
        <Field
          label="Password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          value={password}
          onChange={setPassword}
          minLength={6}
        />
      </div>

      {err ? (
        <div className="rounded-md border border-[#6b2e2e] bg-[#260c0c] px-3 py-2 text-sm text-[#ef4c4c]">
          {err}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-[#5ecde0] px-4 py-2 text-sm font-medium text-[#05080e] transition-colors hover:bg-[#8ee7f4] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Logging in…" : "Log in"}
      </button>

      <p className="text-center text-sm text-[#5a6d82]">
        No account?{" "}
        <Link href="/signup" className="text-[#5ecde0] hover:underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[#5a6d82]">
        {label}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-[#1c2a3e] bg-[#05080e] px-3 py-2 text-sm text-[#d8e4f0] outline-none transition-colors placeholder:text-[#3a4a5e] focus:border-[#5ecde0]"
      />
    </label>
  );
}

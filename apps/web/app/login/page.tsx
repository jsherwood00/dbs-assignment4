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
      className="space-y-5 rounded-xl border border-[#1f2b45] bg-[#131d31] p-6 shadow-lg"
    >
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#e5edf7]">
          {mode === "login" ? "Log in" : "Sign up"}
        </h1>
        <p className="mt-1 text-sm text-[#7b89a1]">
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
        <div className="rounded-md border border-[#3a2a2a] bg-[#1a1212] px-3 py-2 text-sm text-[#f87171]">
          {err}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-[#3a7afe] px-4 py-2 text-sm font-medium text-[#0b1220] transition-colors hover:bg-[#5c92ff] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Logging in…" : "Log in"}
      </button>

      <p className="text-center text-sm text-[#7b89a1]">
        No account?{" "}
        <Link href="/signup" className="text-[#3a7afe] hover:underline">
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
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[#7b89a1]">
        {label}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-[#1f2b45] bg-[#0b1220] px-3 py-2 text-sm text-[#e5edf7] outline-none transition-colors placeholder:text-[#4a5a7a] focus:border-[#3a7afe]"
      />
    </label>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { api } from "@/lib/client";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account.");
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Create your account" body="Your lessons, quizzes, and scores stay private to this account.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block"><span className="label">Name</span><input className="field" required minLength={2} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="block"><span className="label">Email</span><input className="field" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="block"><span className="label">Password</span><input className="field" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error ? <p className="text-sm font-medium text-bad" role="alert">{error}</p> : null}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
      </form>
      <p className="mt-4 text-sm text-muted">Already have an account? <Link className="font-semibold text-accent" href="/login">Sign in</Link></p>
    </AuthFrame>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ErrorState, LoadingState, PageHeader, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import { formatDate } from "@/lib/text";
import type { UserProfile } from "@/lib/types";

export default function ProfilePage() {
  const toast = useToast();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ user: UserProfile }>("/api/auth/me").then((data) => { setUser(data.user); setName(data.user.name); }).catch((err) => setError(err.message));
  }, []);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await api<{ user: UserProfile }>("/api/profile", { method: "PATCH", body: JSON.stringify({ name }) });
      setUser(data.user);
      toast("Profile updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your profile.");
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/profile", { method: "PATCH", body: JSON.stringify({ currentPassword, nextPassword }) });
      setCurrentPassword("");
      setNextPassword("");
      toast("Password updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your password.");
    }
  }

  if (error && !user) return <ErrorState message={error} />;
  if (!user) return <LoadingState label="Loading profile" />;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="Account" title="Profile" body={`Signed in as ${user.email}. Joined ${formatDate(user.createdAt)}.`} />
      <form className="card space-y-4 p-5" onSubmit={saveName}>
        <label className="block"><span className="label">Name</span><input className="field" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} /></label>
        <button className="btn-primary">Save name</button>
      </form>
      <form className="card mt-4 space-y-4 p-5" onSubmit={savePassword}>
        <h2 className="font-display text-2xl">Password</h2>
        <label className="block"><span className="label">Current password</span><input className="field" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required minLength={8} /></label>
        <label className="block"><span className="label">New password</span><input className="field" type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} required minLength={8} /></label>
        <button className="btn-secondary">Change password</button>
      </form>
      {error ? <p className="mt-4 text-sm font-medium text-bad" role="alert">{error}</p> : null}
    </div>
  );
}

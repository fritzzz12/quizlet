"use client";

import { useEffect, useState } from "react";
import { ErrorState, LoadingState, PageHeader, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import type { UserProfile } from "@/lib/types";

export default function SettingsPage() {
  const toast = useToast();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [allowExternalKnowledge, setAllowExternal] = useState(false);
  const [defaultTimer, setDefaultTimer] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ user: UserProfile }>("/api/auth/me")
      .then((data) => {
        setUser(data.user);
        setAllowExternal(data.user.allowExternalKnowledge);
        setDefaultTimer(data.user.defaultTimer);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      const data = await api<{ user: UserProfile }>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ allowExternalKnowledge, defaultTimer }),
      });
      setUser(data.user);
      toast("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    }
  }

  if (error && !user) return <ErrorState message={error} />;
  if (!user) return <LoadingState label="Loading settings" />;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="Settings" title="Study settings" body="Questions stay inside the uploaded PDF unless you explicitly allow outside knowledge." />
      <form className="card space-y-5 p-5" onSubmit={save}>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={defaultTimer} onChange={(event) => setDefaultTimer(event.target.checked)} />
          <span><span className="font-semibold">Start quizzes with a timer</span><span className="mt-1 block text-muted">You can still turn the timer off on the quiz start screen.</span></span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={allowExternalKnowledge} onChange={(event) => setAllowExternal(event.target.checked)} />
          <span>
            <span className="font-semibold">Allow external knowledge</span>
            <span className="mt-1 block text-muted">Off by default. When on, a configured language model may add a clearly labeled question beyond the PDF. The built-in generator never leaves the lesson.</span>
          </span>
        </label>
        <p className="text-sm text-muted">{user.aiConfigured ? "A language model is configured on the server." : "No language model key is configured. Set OPENAI_API_KEY or AI_API_KEY on the server to use one. Keys are never sent to the browser."}</p>
        <button className="btn-primary">Save settings</button>
      </form>
      {error ? <p className="mt-4 text-sm font-medium text-bad" role="alert">{error}</p> : null}
    </div>
  );
}

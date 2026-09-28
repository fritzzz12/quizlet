"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "@/components/ui";
import { api } from "@/lib/client";
import type { LessonCard } from "@/lib/types";

type ChatMessage = { role: "user" | "assistant"; content: string; references?: { page: number; excerpt: string }[]; suggestedTopic?: string };

const PROMPTS = [
  "Explain this lesson in simple terms.",
  "What are the most important concepts?",
  "Give me a summary.",
  "What topics should I review?",
  "Give me examples based on this lesson.",
];

export default function AssistantPage() {
  const params = useParams<{ id: string }>();
  const [lesson, setLesson] = useState<LessonCard | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ lesson: LessonCard }>(`/api/lessons/${params.id}`).then((data) => setLesson(data.lesson)).catch((err) => setError(err.message));
  }, [params.id]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const history = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(history);
    setQuestion("");
    setBusy(true);
    setError("");
    try {
      const result = await api<{ reply: string; references: { page: number; excerpt: string }[]; suggestedTopic?: string }>("/api/assistant", {
        method: "POST",
        body: JSON.stringify({
          lessonId: params.id,
          question: trimmed,
          history: history.slice(-6).map((item) => ({ role: item.role, content: item.content })),
        }),
      });
      setMessages((current) => [...current, { role: "assistant", content: result.reply, references: result.references, suggestedTopic: result.suggestedTopic }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant could not answer.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !lesson) return <ErrorState message={error} />;
  if (!lesson) return <LoadingState label="Opening the lesson" />;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{lesson.title}</p>
      <h1 className="mt-2 font-display text-5xl">Study assistant</h1>
      <p className="mt-2 text-sm leading-6 text-muted">Answers come from this PDF. Passages include a page reference when one can be found.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {PROMPTS.map((prompt) => (
          <button key={prompt} className="rounded-full border border-line bg-white px-3 py-2 text-left text-sm" onClick={() => ask(prompt)}>{prompt}</button>
        ))}
      </div>
      <div className="mt-5 space-y-3">
        {messages.map((message, index) => (
          <article key={index} className={`rounded-3xl px-4 py-4 text-sm leading-6 ${message.role === "user" ? "bg-navy text-white" : "card"}`}>
            <p className="whitespace-pre-wrap">{message.content}</p>
            {message.references?.length ? (
              <ul className="mt-3 space-y-2 border-t border-line pt-3 text-muted">
                {message.references.map((ref) => (
                  <li key={`${ref.page}-${ref.excerpt.slice(0, 24)}`}><span className="font-semibold text-ink">Page {ref.page}.</span> {ref.excerpt}</li>
                ))}
              </ul>
            ) : null}
            {message.suggestedTopic ? <Link className="mt-3 inline-flex btn-primary" href={`/lessons/${params.id}/generate?topic=${encodeURIComponent(message.suggestedTopic)}`}>Create this quiz</Link> : message.content.includes("quiz generator") ? <Link className="mt-3 inline-flex btn-primary" href={`/lessons/${params.id}/generate`}>Open quiz generator</Link> : null}
          </article>
        ))}
        {busy ? <p className="text-sm text-muted" role="status">Looking through the lesson…</p> : null}
      </div>
      {error ? <p className="mt-3 text-sm font-medium text-bad" role="alert">{error}</p> : null}
      <form className="mt-5 flex gap-2" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
        <label className="sr-only" htmlFor="ask">Ask about this lesson</label>
        <input id="ask" className="field" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this lesson" />
        <button className="btn-primary" disabled={busy || question.trim().length < 2}>Ask</button>
      </form>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QuizCardView } from "@/components/cards";
import { ErrorState, LoadingState, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import { formatBytes, formatDate } from "@/lib/text";
import type { LessonCard, QuizCard } from "@/lib/types";

export default function LessonDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [data, setData] = useState<{ lesson: LessonCard; preview: string; quizzes: QuizCard[] } | null>(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");

  function load() {
    api<{ lesson: LessonCard; preview: string; quizzes: QuizCard[] }>(`/api/lessons/${params.id}`)
      .then((next) => {
        setData(next);
        setTitle(next.lesson.title);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, [params.id]);

  async function saveTitle() {
    try {
      await api(`/api/lessons/${params.id}`, { method: "PATCH", body: JSON.stringify({ title }) });
      toast("Title saved.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename the lesson.");
    }
  }

  async function remove() {
    const ok = await confirm({ title: "Delete this lesson?", body: "The PDF, generated quizzes, and scores for this lesson will be removed.", confirmLabel: "Delete lesson", danger: true });
    if (!ok) return;
    await api(`/api/lessons/${params.id}`, { method: "DELETE" });
    router.push("/lessons");
  }

  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingState label="Loading lesson" />;
  const lesson = data.lesson;
  const ready = lesson.contentStatus === "readable";

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Lesson</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Lesson title" />
        <button className="btn-ghost" onClick={saveTitle}>Save title</button>
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <Meta label="File name" value={lesson.filename} />
        <Meta label="Uploaded" value={formatDate(lesson.createdAt)} />
        <Meta label="Size" value={formatBytes(lesson.fileSize)} />
        <Meta label="Pages" value={String(lesson.pageCount)} />
        <Meta label="Processing" value={lesson.processingStatus} />
        <Meta label="Extracted content" value={lesson.contentStatus} />
      </dl>
      {lesson.failureReason ? <p className="mt-4 rounded-2xl bg-bad/10 px-4 py-3 text-sm text-bad" role="alert">{lesson.failureReason}</p> : null}
      <section className="card mt-5 p-5">
        <h2 className="font-display text-2xl">Lesson preview</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{lesson.summary || data.preview || "No preview is available."}</p>
        {ready ? <p className="mt-3 text-sm text-muted">{lesson.conceptCount} concepts found · up to {lesson.maxQuestions} questions can be supported.</p> : null}
      </section>
      <div className="mt-5 flex flex-wrap gap-2">
        {ready ? <Link className="btn-primary" href={`/lessons/${lesson.id}/generate`}>Create a quiz</Link> : null}
        {ready ? <Link className="btn-secondary" href={`/lessons/${lesson.id}/assistant`}>Study assistant</Link> : null}
        <a className="btn-ghost" href={`/api/lessons/${lesson.id}/file`}>Download PDF</a>
        <button className="btn-danger" onClick={remove}>Delete</button>
      </div>
      <section className="mt-8">
        <h2 className="font-display text-3xl">Quizzes from this lesson</h2>
        {data.quizzes.length ? <div className="mt-4 grid gap-4 md:grid-cols-2">{data.quizzes.map((quiz) => <QuizCardView key={quiz.id} quiz={quiz} />)}</div> : <p className="mt-3 text-sm text-muted">No quizzes yet. A new quiz can use a different difficulty or question type, and it will avoid repeating earlier questions when it can.</p>}
      </section>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="card px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-sm font-semibold capitalize">{value}</p></div>;
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LessonCardView, QuizCardView } from "@/components/cards";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { api } from "@/lib/client";
import { DIFFICULTY_LABELS, type Difficulty } from "@/lib/constants";
import type { LessonCard, QuizCard } from "@/lib/types";

type Activity = { kind: string; id: string; title: string; detail: string; createdAt: string; quizId?: string };
type DashboardData = {
  lessons: LessonCard[];
  quizzes: QuizCard[];
  activity: Activity[];
  performance: {
    completed: number;
    average: number;
    highest: number;
    answered: number;
    byDifficulty: Record<Difficulty, { correct: number; total: number }>;
  };
  counts: { lessons: number; quizzes: number };
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  function load() {
    setError("");
    api<DashboardData>("/api/dashboard").then(setData).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, []);
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingState label="Loading your study desk" />;

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard"
        title="Your study desk"
        body="Upload a lesson, generate a quiz from that PDF, then review what you missed."
        action={<Link href="/lessons/upload" className="btn-primary">Upload lesson</Link>}
      />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Quizzes completed" value={String(data.performance.completed)} />
        <Stat label="Average score" value={data.performance.completed ? `${data.performance.average}%` : "—"} />
        <Stat label="Highest score" value={data.performance.completed ? `${data.performance.highest}%` : "—"} />
        <Stat label="Questions answered" value={String(data.performance.answered)} />
      </section>
      <section className="card mt-4 p-5">
        <h2 className="font-display text-2xl">Performance by difficulty</h2>
        <div className="mt-4 space-y-3">
          {(["easy", "moderate", "hard"] as Difficulty[]).map((level) => {
            const row = data.performance.byDifficulty[level];
            const width = row.total ? (row.correct / row.total) * 100 : 0;
            return (
              <div key={level}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-semibold">{DIFFICULTY_LABELS[level]}</span>
                  <span className="text-muted">{row.correct}/{row.total}</span>
                </div>
                <div className="h-2 rounded-full bg-line"><div className="h-2 rounded-full bg-teal" style={{ width: `${width}%` }} /></div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-3xl">My lessons</h2>
          <Link href="/lessons" className="text-sm font-semibold text-accent">View all</Link>
        </div>
        {data.lessons.length ? (
          <div className="grid gap-4 md:grid-cols-2">{data.lessons.map((lesson) => <LessonCardView key={lesson.id} lesson={lesson} />)}</div>
        ) : (
          <EmptyState title="No lessons yet" body="Upload a PDF and Folio will read it before writing any questions." action={<Link className="btn-primary" href="/lessons/upload">Upload a PDF</Link>} />
        )}
      </section>
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-3xl">My quizzes</h2>
          <Link href="/quizzes" className="text-sm font-semibold text-accent">View all</Link>
        </div>
        {data.quizzes.length ? (
          <div className="grid gap-4 md:grid-cols-2">{data.quizzes.map((quiz) => <QuizCardView key={quiz.id} quiz={quiz} />)}</div>
        ) : (
          <EmptyState title="No quizzes yet" body="A quiz appears here after you generate one from a lesson." />
        )}
      </section>
      <section className="mt-8">
        <h2 className="font-display text-3xl">Recent activity</h2>
        {data.activity.length ? (
          <ul className="card mt-3 divide-y divide-line">
            {data.activity.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="px-5 py-4">
                <p className="font-semibold">{item.title}</p>
                <p className="text-sm text-muted">{item.detail}</p>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-muted">Uploads, generated quizzes, and finished attempts will show up here.</p>}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
    </div>
  );
}

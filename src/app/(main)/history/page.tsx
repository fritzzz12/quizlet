"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { api } from "@/lib/client";
import { formatDate, formatDuration } from "@/lib/text";

type AttemptRow = {
  id: string;
  quiz_id: string;
  score: number;
  percentage: number;
  correct_count: number;
  question_count: number;
  time_taken_seconds: number | null;
  timer_enabled: number;
  completed_at: string;
  quiz_title: string;
  difficulty: string;
  lesson_title: string;
  lesson_id: string;
};

export default function HistoryPage() {
  const [attempts, setAttempts] = useState<AttemptRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ attempts: AttemptRow[] }>("/api/history").then((data) => setAttempts(data.attempts)).catch((err) => setError(err.message));
  }, []);
  if (error) return <ErrorState message={error} />;
  if (!attempts) return <LoadingState label="Loading history" />;
  return (
    <div>
      <PageHeader eyebrow="History" title="Quiz history" body="Every submitted attempt is kept so you can review the score and the explanations." />
      {attempts.length ? (
        <ul className="space-y-3">
          {attempts.map((attempt) => (
            <li key={attempt.id} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-display text-2xl">{attempt.quiz_title}</p>
                <p className="text-sm text-muted">{attempt.lesson_title} · {formatDate(attempt.completed_at)}</p>
                <p className="mt-1 text-sm font-semibold">{attempt.correct_count}/{attempt.question_count} · {Math.round(attempt.percentage)}%{attempt.timer_enabled ? ` · ${formatDuration(attempt.time_taken_seconds)}` : ""}</p>
              </div>
              <Link className="btn-secondary" href={`/quizzes/${attempt.quiz_id}/results/${attempt.id}`}>Review</Link>
            </li>
          ))}
        </ul>
      ) : <EmptyState title="No attempts yet" body="Finish a quiz and the result will be saved here." />}
    </div>
  );
}

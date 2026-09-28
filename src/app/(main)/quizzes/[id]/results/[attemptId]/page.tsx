"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState, ScoreDisplay, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import { DIFFICULTY_LABELS, TYPE_LABELS, type Difficulty, type QuestionType } from "@/lib/constants";
import { formatDate, formatDuration } from "@/lib/text";
import type { AttemptReview } from "@/lib/types";

export default function ResultsPage() {
  const params = useParams<{ id: string; attemptId: string }>();
  const toast = useToast();
  const [attempt, setAttempt] = useState<AttemptReview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ attempt: AttemptReview }>(`/api/attempts/${params.attemptId}`).then((data) => setAttempt(data.attempt)).catch((err) => setError(err.message));
  }, [params.attemptId]);

  async function toggleSave(questionId: string, saved: boolean) {
    await api("/api/saved", { method: "POST", body: JSON.stringify({ questionId, saved: !saved }) });
    setAttempt((current) => current ? { ...current, questions: current.questions.map((question) => question.id === questionId ? { ...question, saved: !saved } : question) } : current);
    toast(!saved ? "Question saved for study." : "Question removed from saved study.");
  }

  if (error) return <ErrorState message={error} />;
  if (!attempt) return <LoadingState label="Scoring your quiz" />;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{attempt.lessonTitle}</p>
      <h1 className="mt-2 font-display text-5xl">Results</h1>
      <p className="mt-2 text-sm text-muted">{attempt.quizTitle} · {formatDate(attempt.completedAt)}</p>
      <div className="mt-5"><ScoreDisplay score={attempt.score} total={attempt.total} percentage={attempt.percentage} /></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Mini label="Correct" value={String(attempt.correctCount)} />
        <Mini label="Incorrect" value={String(attempt.incorrectCount)} />
        <Mini label="Unanswered" value={String(attempt.unansweredCount)} />
      </div>
      {attempt.timerEnabled ? <p className="mt-3 text-sm text-muted">Time taken {formatDuration(attempt.timeTakenSeconds)}</p> : null}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Breakdown title="By difficulty" rows={attempt.byDifficulty} labels={DIFFICULTY_LABELS} />
        <Breakdown title="By question type" rows={attempt.byType} labels={TYPE_LABELS} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link className="btn-primary" href={`/quizzes/${attempt.quizId}`}>Take again</Link>
        <Link className="btn-ghost" href={`/lessons/${attempt.lessonId}/generate`}>New quiz from this lesson</Link>
      </div>
      <h2 className="mt-8 font-display text-3xl">Review answers</h2>
      <div className="mt-4 space-y-4">
        {attempt.questions.map((question) => (
          <article key={question.id} className={`card border-l-4 p-5 ${question.isCorrect ? "border-l-teal" : question.unanswered ? "border-l-line" : "border-l-bad"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Question {question.order} · {TYPE_LABELS[question.questionType as QuestionType]} · {DIFFICULTY_LABELS[question.difficulty as Difficulty]}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${question.isCorrect ? "bg-teal/10 text-teal" : "bg-bad/10 text-bad"}`}>{question.isCorrect ? "Correct" : question.unanswered ? "Unanswered" : "Incorrect"}</span>
            </div>
            <h3 className="mt-3 whitespace-pre-wrap font-display text-2xl">{question.questionText}</h3>
            <p className="mt-3 text-sm"><span className="font-semibold">Your answer: </span>{question.userAnswer}</p>
            <p className="mt-1 text-sm"><span className="font-semibold">Correct answer: </span>{question.correctAnswer}</p>
            <p className="mt-3 text-sm leading-6 text-muted">{question.explanation}</p>
            <p className="mt-2 text-sm text-muted"><span className="font-semibold text-ink">{question.sourceReference}.</span> {question.sourceExcerpt}</p>
            {!question.grounded ? <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-warn">Marked as outside the lesson</p> : null}
            <button className="btn-ghost mt-4" onClick={() => toggleSave(question.id, question.saved)}>{question.saved ? "Saved" : "Save question"}</button>
          </article>
        ))}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-1 font-display text-3xl">{value}</p></div>;
}

function Breakdown({ title, rows, labels }: { title: string; rows: Record<string, { correct: number; total: number }>; labels: Record<string, string> }) {
  const entries = Object.entries(rows);
  return (
    <section className="card p-4">
      <h2 className="font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {entries.length ? entries.map(([key, row]) => <li key={key} className="flex justify-between"><span>{labels[key] || key}</span><span className="font-semibold">{row.correct}/{row.total}</span></li>) : <li className="text-muted">No items</li>}
      </ul>
    </section>
  );
}

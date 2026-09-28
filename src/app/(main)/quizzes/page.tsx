"use client";

import { useEffect, useState } from "react";
import { QuizCardView } from "@/components/cards";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { api } from "@/lib/client";
import type { QuizCard } from "@/lib/types";

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<QuizCard[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ quizzes: QuizCard[] }>("/api/quizzes").then((data) => setQuizzes(data.quizzes)).catch((err) => setError(err.message));
  }, []);
  if (error) return <ErrorState message={error} />;
  if (!quizzes) return <LoadingState label="Loading quizzes" />;
  return (
    <div>
      <PageHeader eyebrow="Quizzes" title="My quizzes" body="Take a saved quiz again any time. Scores stay in your history." />
      {quizzes.length ? <div className="grid gap-4 md:grid-cols-2">{quizzes.map((quiz) => <QuizCardView key={quiz.id} quiz={quiz} />)}</div> : <EmptyState title="No quizzes yet" body="Open a lesson and generate a quick, custom, or mixed quiz." />}
    </div>
  );
}

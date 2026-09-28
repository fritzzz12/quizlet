"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { QuizTaker } from "@/components/quiz-taker";
import { ErrorState, LoadingState } from "@/components/ui";
import { api } from "@/lib/client";
import type { PublicQuestion, QuizCard, UserProfile } from "@/lib/types";

export default function QuizPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<{ quiz: QuizCard; questions: PublicQuestion[]; defaultTimer: boolean } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<{ quiz: QuizCard; questions: PublicQuestion[] }>(`/api/quizzes/${params.id}`),
      api<{ user: UserProfile }>("/api/auth/me"),
    ])
      .then(([quiz, me]) => setData({ ...quiz, defaultTimer: me.user.defaultTimer }))
      .catch((err) => setError(err.message));
  }, [params.id]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Preparing the quiz" />;
  return <QuizTaker quiz={data.quiz} questions={data.questions} defaultTimer={data.defaultTimer} />;
}

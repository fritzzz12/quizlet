"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { api } from "@/lib/client";
import { DIFFICULTY_LABELS, TYPE_LABELS, type Difficulty, type QuestionType } from "@/lib/constants";

type Saved = {
  id: string;
  quizTitle: string;
  lessonTitle: string;
  questionText: string;
  questionType: QuestionType;
  difficulty: Difficulty;
  correctAnswer: string;
  explanation: string;
  sourceReference: string;
  sourceExcerpt: string;
};

export default function StudyPage() {
  const [questions, setQuestions] = useState<Saved[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ questions: Saved[] }>("/api/saved").then((data) => setQuestions(data.questions)).catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!questions) return <LoadingState label="Loading saved questions" />;

  const current = questions[index];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Study" title="Saved questions" body="Review questions you saved after a quiz. The answer stays hidden until you flip the card." />
      {current ? (
        <article className="card p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{current.lessonTitle} · {TYPE_LABELS[current.questionType]} · {DIFFICULTY_LABELS[current.difficulty]}</p>
          <h2 className="mt-3 whitespace-pre-wrap font-display text-3xl">{current.questionText}</h2>
          {revealed ? (
            <div className="mt-5 rounded-2xl bg-paper p-4 text-sm leading-6">
              <p><span className="font-semibold">Answer: </span>{current.correctAnswer}</p>
              <p className="mt-2 text-muted">{current.explanation}</p>
              <p className="mt-2 text-muted"><span className="font-semibold text-ink">{current.sourceReference}.</span> {current.sourceExcerpt}</p>
            </div>
          ) : (
            <button className="btn-primary mt-5" onClick={() => setRevealed(true)}>Reveal answer</button>
          )}
          <div className="mt-5 flex items-center justify-between">
            <button className="btn-ghost" disabled={index === 0} onClick={() => { setIndex((value) => value - 1); setRevealed(false); }}>Previous</button>
            <span className="text-sm text-muted">{index + 1} / {questions.length}</span>
            <button className="btn-ghost" disabled={index === questions.length - 1} onClick={() => { setIndex((value) => value + 1); setRevealed(false); }}>Next</button>
          </div>
        </article>
      ) : <EmptyState title="Nothing saved yet" body="After you finish a quiz, save individual questions from the review page." />}
    </div>
  );
}

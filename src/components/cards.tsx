"use client";

import Link from "next/link";
import { DIFFICULTY_LABELS, TYPE_LABELS, type QuestionType } from "@/lib/constants";
import { formatDate } from "@/lib/text";
import type { LessonCard, QuizCard } from "@/lib/types";

export function LessonCardView({ lesson }: { lesson: LessonCard }) {
  return (
    <article className="card flex h-full flex-col p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{lesson.contentStatus === "readable" ? "Ready" : "Needs attention"}</p>
      <h2 className="mt-2 font-display text-2xl leading-tight">{lesson.title}</h2>
      <p className="mt-1 truncate text-sm text-muted">{lesson.filename}</p>
      <p className="mt-4 text-sm text-muted">Uploaded {formatDate(lesson.createdAt)}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full bg-paper px-3 py-1">{lesson.quizCount} {lesson.quizCount === 1 ? "quiz" : "quizzes"}</span>
        <span className="rounded-full bg-paper px-3 py-1">{lesson.lastScore == null ? "No score yet" : `Last score ${lesson.lastScore}%`}</span>
      </div>
      <div className="mt-5 flex gap-2">
        <Link href={`/lessons/${lesson.id}`} className="btn-ghost">Open</Link>
        {lesson.contentStatus === "readable" ? <Link href={`/lessons/${lesson.id}/generate`} className="btn-primary">Create quiz</Link> : null}
      </div>
    </article>
  );
}

export function QuizCardView({ quiz }: { quiz: QuizCard }) {
  const difficulty = quiz.difficulty === "mixed" ? "Mixed difficulty" : DIFFICULTY_LABELS[quiz.difficulty as keyof typeof DIFFICULTY_LABELS] || quiz.difficulty;
  return (
    <article className="card flex h-full flex-col p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal">{difficulty}</p>
      <h2 className="mt-2 font-display text-2xl leading-tight">{quiz.title}</h2>
      <p className="mt-1 text-sm text-muted">{quiz.lessonTitle}</p>
      <p className="mt-4 text-sm text-muted">
        {quiz.questionCount} questions · {quiz.questionTypes.map((type) => TYPE_LABELS[type as QuestionType] || type).join(", ")}
      </p>
      <p className="mt-1 text-sm text-muted">Created {formatDate(quiz.createdAt)}</p>
      <p className="mt-3 text-sm font-semibold">{quiz.lastPercentage == null ? "Not taken yet" : `Last score ${quiz.lastScore}/${quiz.questionCount} · ${quiz.lastPercentage}%`}</p>
      <div className="mt-5 flex gap-2">
        <Link href={`/quizzes/${quiz.id}`} className="btn-primary">Take quiz</Link>
        <Link href={`/lessons/${quiz.lessonId}`} className="btn-ghost">Lesson</Link>
      </div>
    </article>
  );
}

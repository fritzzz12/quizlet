"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LessonCardView } from "@/components/cards";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { api } from "@/lib/client";
import type { LessonCard } from "@/lib/types";

export default function LessonsPage() {
  const [lessons, setLessons] = useState<LessonCard[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ lessons: LessonCard[] }>("/api/lessons").then((data) => setLessons(data.lessons)).catch((err) => setError(err.message));
  }, []);
  if (error) return <ErrorState message={error} />;
  if (!lessons) return <LoadingState label="Loading lessons" />;
  return (
    <div>
      <PageHeader eyebrow="Lessons" title="My lessons" body="Each card is a PDF you uploaded. Quizzes are generated from that file only." action={<Link href="/lessons/upload" className="btn-primary">Upload lesson</Link>} />
      {lessons.length ? <div className="grid gap-4 md:grid-cols-2">{lessons.map((lesson) => <LessonCardView key={lesson.id} lesson={lesson} />)}</div> : <EmptyState title="No lessons yet" body="Upload a text-based PDF to start." action={<Link href="/lessons/upload" className="btn-primary">Upload a PDF</Link>} />}
    </div>
  );
}

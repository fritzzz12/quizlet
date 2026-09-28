"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { api } from "@/lib/client";
import { QUESTION_TYPES, TYPE_LABELS, type Difficulty, type QuestionType, type QuizMode } from "@/lib/constants";
import type { LessonCard } from "@/lib/types";

const PRESETS = [5, 10, 15, 20];

function Generator() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [lesson, setLesson] = useState<LessonCard | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<QuizMode>("quick");
  const [difficulty, setDifficulty] = useState<Difficulty>("moderate");
  const [types, setTypes] = useState<QuestionType[]>([...QUESTION_TYPES]);
  const [count, setCount] = useState(10);
  const [customCount, setCustomCount] = useState("");
  const [mix, setMix] = useState({ easy: 40, moderate: 40, hard: 20 });
  const [topic, setTopic] = useState(search.get("topic") || "");
  const [allowExternal, setAllowExternal] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [externalAllowed, setExternalAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    api<{ lesson: LessonCard }>(`/api/lessons/${params.id}`).then((data) => setLesson(data.lesson)).catch((err) => setError(err.message));
    api<{ user: { aiConfigured: boolean; allowExternalKnowledge: boolean } }>("/api/auth/me")
      .then((data) => {
        setAiConfigured(data.user.aiConfigured);
        setExternalAllowed(data.user.allowExternalKnowledge);
      })
      .catch(() => undefined);
  }, [params.id]);

  function toggleType(type: QuestionType) {
    setTypes((current) => (current.includes(type) ? current.filter((item) => item !== type) : [...current, type]));
  }

  const questionCount = customCount ? Math.max(1, Math.min(30, Number(customCount) || 1)) : count;
  const mixTotal = mix.easy + mix.moderate + mix.hard;

  async function generate() {
    setBusy(true);
    setError("");
    setNote("Reading the lesson, drafting questions, and checking that each one is supported…");
    try {
      const result = await api<{ quizId: string; note: string }>("/api/quizzes/generate", {
        method: "POST",
        body: JSON.stringify({
          lessonId: params.id,
          mode,
          difficulty: mode === "custom" ? difficulty : "mixed",
          mix: mode === "mixed" ? mix : undefined,
          types: mode === "quick" ? undefined : types,
          count: questionCount,
          topic: topic.trim() || undefined,
          allowExternal: allowExternal && externalAllowed,
        }),
      });
      if (result.note) setNote(result.note);
      router.push(`/quizzes/${result.quizId}`);
    } catch (err) {
      setNote("");
      setError(err instanceof Error ? err.message : "Could not generate the quiz.");
      setBusy(false);
    }
  }

  if (error && !lesson) return <ErrorState message={error} />;
  if (!lesson) return <LoadingState label="Loading lesson" />;
  if (lesson.contentStatus !== "readable") {
    return <ErrorState message={lesson.failureReason || "This PDF does not have enough readable text for a reliable quiz."} />;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={lesson.title} title="Create a quiz" body={`This lesson can support about ${lesson.maxQuestions} questions from ${lesson.conceptCount} concepts. New quizzes avoid repeating earlier questions when the lesson allows it.`} />
      <div className="grid gap-3 sm:grid-cols-3">
        {([
          ["quick", "Quick quiz", "A balanced mix of easy, moderate, and hard questions across all three types."],
          ["custom", "Custom quiz", "Choose one difficulty, the question types, and how many questions."],
          ["mixed", "Mixed difficulty", "Set your own split, such as 40% easy, 40% moderate, and 20% hard."],
        ] as const).map(([value, label, body]) => (
          <button key={value} type="button" className={`card p-4 text-left ${mode === value ? "border-navy ring-2 ring-navy" : ""}`} onClick={() => setMode(value)} aria-pressed={mode === value}>
            <span className="font-semibold">{label}</span>
            <span className="mt-2 block text-sm leading-6 text-muted">{body}</span>
          </button>
        ))}
      </div>

      {mode === "custom" ? (
        <fieldset className="mt-6">
          <legend className="label">Difficulty</legend>
          <div className="grid gap-3">
            {([
              ["easy", "Easy", "Recall, definitions, and direct facts."],
              ["moderate", "Moderate", "Interpretation, relationships, and comparison."],
              ["hard", "Hard", "Analysis, close distinctions, and multi-step reasoning."],
            ] as const).map(([value, label, body]) => (
              <label key={value} className={`card flex cursor-pointer gap-3 p-4 ${difficulty === value ? "border-navy" : ""}`}>
                <input type="radio" name="difficulty" checked={difficulty === value} onChange={() => setDifficulty(value)} />
                <span><span className="font-semibold">{label}</span><span className="mt-1 block text-sm text-muted">{body}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {mode === "mixed" ? (
        <div className="card mt-6 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Difficulty mix</h2>
            <button className="text-sm font-semibold text-accent" type="button" onClick={() => setMix({ easy: 40, moderate: 40, hard: 20 })}>Use 40 / 40 / 20</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(["easy", "moderate", "hard"] as Difficulty[]).map((level) => (
              <label key={level} className="text-sm">
                <span className="label capitalize">{level} %</span>
                <input className="field" type="number" min={0} max={100} value={mix[level]} onChange={(event) => setMix({ ...mix, [level]: Number(event.target.value) })} />
              </label>
            ))}
          </div>
          <p className={`mt-3 text-sm ${mixTotal === 100 ? "text-teal" : "text-bad"}`}>Total {mixTotal}%. The mix must equal 100%.</p>
        </div>
      ) : null}

      {mode !== "quick" ? (
        <fieldset className="mt-6">
          <legend className="label">Question types</legend>
          <div className="grid gap-2">
            {QUESTION_TYPES.map((type) => (
              <label key={type} className="card flex items-center gap-3 p-4 text-sm font-semibold">
                <input type="checkbox" checked={types.includes(type)} onChange={() => toggleType(type)} />
                {TYPE_LABELS[type]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="mt-6">
        <p className="label">Number of questions</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button key={preset} type="button" className={`rounded-full px-4 py-2 text-sm font-semibold ${!customCount && count === preset ? "bg-navy text-white" : "bg-white border border-line"}`} onClick={() => { setCount(preset); setCustomCount(""); }}>{preset}</button>
          ))}
        </div>
        <label className="mt-3 block text-sm">
          <span className="label">Custom number</span>
          <input className="field max-w-[140px]" type="number" min={1} max={lesson.maxQuestions} placeholder="1–30" value={customCount} onChange={(event) => setCustomCount(event.target.value)} />
        </label>
        <p className="mt-2 text-sm text-muted">Folio will stop at {lesson.maxQuestions} if the lesson cannot support more.</p>
      </div>

      <label className="mt-6 block">
        <span className="label">Optional topic focus</span>
        <input className="field" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Example: routing" />
      </label>

      <label className="mt-4 flex items-start gap-3 text-sm">
        <input type="checkbox" checked={allowExternal} disabled={!externalAllowed} onChange={(event) => setAllowExternal(event.target.checked)} />
        <span>
          Allow a question beyond the PDF
          <span className="mt-1 block text-muted">{externalAllowed ? "External knowledge is enabled in Settings. Questions are still checked, and any outside item is labeled." : "Turn this on in Settings first. Until then, every question stays inside the uploaded lesson."}{aiConfigured ? "" : " Without an AI provider, generation always stays inside the lesson."}</span>
        </span>
      </label>

      {note ? <p className="mt-4 text-sm font-semibold text-navy" role="status">{note}</p> : null}
      {error ? <p className="mt-4 text-sm font-medium text-bad" role="alert">{error}</p> : null}
      <button className="btn-primary mt-5" disabled={busy || (mode === "mixed" && mixTotal !== 100) || (mode !== "quick" && types.length === 0)} onClick={generate}>
        {busy ? "Generating…" : "Generate quiz"}
      </button>
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading quiz setup" />}>
      <Generator />
    </Suspense>
  );
}

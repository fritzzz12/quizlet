"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { TYPE_LABELS, type QuestionType } from "@/lib/constants";
import type { PublicQuestion, QuizCard } from "@/lib/types";
import { useConfirm } from "@/components/ui";
import { ProgressBar } from "@/components/ui";

type AnswerState = {
  selectedChoiceId?: string;
  identification?: string;
  verdict?: "true" | "false";
  incorrectPhrase?: string;
  correction?: string;
};

function clock(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function QuizTaker({ quiz, questions, defaultTimer }: { quiz: QuizCard; questions: PublicQuestion[]; defaultTimer: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [phase, setPhase] = useState<"lobby" | "active">("lobby");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [timerEnabled, setTimerEnabled] = useState(defaultTimer);
  const [minutes, setMinutes] = useState(Math.max(5, Math.ceil(questions.length * 1.25)));
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const answersRef = useRef(answers);
  const submittingRef = useRef(false);
  const startedRef = useRef<number>(0);
  answersRef.current = answers;

  useEffect(() => {
    if (phase !== "active" || !timerEnabled) return;
    const timer = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          void submit(true);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, timerEnabled]);

  function update(id: string, patch: AnswerState) {
    setAnswers((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function start() {
    startedRef.current = Date.now();
    setRemaining(minutes * 60);
    setPhase("active");
  }

  async function exit() {
    const dirty = Object.keys(answersRef.current).length > 0;
    if (dirty) {
      const ok = await confirm({ title: "Leave this quiz?", body: "Your answers on this attempt will not be saved.", confirmLabel: "Leave", danger: true });
      if (!ok) return;
    }
    router.push("/quizzes");
  }

  async function submit(auto = false) {
    if (submittingRef.current) return;
    const unanswered = questions.filter((question) => !isAnswered(question, answersRef.current[question.id])).length;
    if (!auto && unanswered) {
      const ok = await confirm({
        title: "Submit with blank answers?",
        body: `${unanswered} question${unanswered === 1 ? " is" : "s are"} still unanswered. Unanswered questions are marked incorrect.`,
        confirmLabel: "Submit quiz",
      });
      if (!ok) return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const payload = questions.map((question) => ({ questionId: question.id, ...answersRef.current[question.id] }));
      const elapsed = Math.max(0, Math.round((Date.now() - startedRef.current) / 1000));
      const result = await api<{ attemptId: string }>(`/api/quizzes/${quiz.id}/attempts`, {
        method: "POST",
        body: JSON.stringify({ answers: payload, timeTakenSeconds: elapsed, timerEnabled }),
      });
      router.push(`/quizzes/${quiz.id}/results/${result.attemptId}`);
    } catch (err) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Could not submit the quiz.");
    }
  }

  if (phase === "lobby") {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{quiz.lessonTitle}</p>
        <h1 className="mt-2 font-display text-5xl">{quiz.title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          {quiz.questionCount} questions · {quiz.questionTypes.map((type) => TYPE_LABELS[type as QuestionType] || type).join(", ")}. Correct answers stay hidden until you submit.
        </p>
        {quiz.generationNote ? <p className="mt-3 rounded-2xl bg-paper px-4 py-3 text-sm text-muted">{quiz.generationNote}</p> : null}
        <label className="mt-6 flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" checked={timerEnabled} onChange={(event) => setTimerEnabled(event.target.checked)} />
          Use a timer
        </label>
        {timerEnabled ? (
          <label className="mt-3 block text-sm">
            <span className="label">Minutes</span>
            <input className="field max-w-[120px]" type="number" min={1} max={60} value={minutes} onChange={(event) => setMinutes(Number(event.target.value) || 1)} />
          </label>
        ) : null}
        <div className="mt-6 flex gap-2">
          <button className="btn-primary" onClick={start}>Start quiz</button>
          <button className="btn-ghost" onClick={() => router.push("/quizzes")}>Back</button>
        </div>
      </div>
    );
  }

  const question = questions[index];
  const answer = answers[question.id] || {};
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Question {index + 1} of {questions.length}</p>
        <div className="flex items-center gap-3">
          {timerEnabled ? <span className={`text-sm font-semibold ${remaining < 60 ? "text-bad" : "text-navy"}`}>{clock(remaining)}</span> : null}
          <button className="btn-ghost px-3 py-2" onClick={exit}>Exit</button>
        </div>
      </div>
      <ProgressBar value={((index + 1) / questions.length) * 100} label="Progress" />
      <div className="mt-4 flex flex-wrap gap-2">
        {questions.map((item, itemIndex) => (
          <button key={item.id} className={`h-8 w-8 rounded-full text-xs font-semibold ${itemIndex === index ? "bg-navy text-white" : isAnswered(item, answers[item.id]) ? "bg-teal text-white" : "bg-line text-ink"}`} onClick={() => setIndex(itemIndex)} aria-label={`Go to question ${itemIndex + 1}`}>
            {itemIndex + 1}
          </button>
        ))}
      </div>
      <article className="card mt-5 p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{TYPE_LABELS[question.questionType]}</p>
        <QuestionBody question={question} answer={answer} onChange={(patch) => update(question.id, patch)} />
      </article>
      {error ? <p className="mt-4 text-sm font-medium text-bad" role="alert">{error}</p> : null}
      <div className="mt-5 flex items-center justify-between gap-2">
        <button className="btn-ghost" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>Previous</button>
        <div className="flex gap-2">
          {index < questions.length - 1 ? <button className="btn-secondary" onClick={() => setIndex((value) => value + 1)}>Next</button> : null}
          <button className="btn-primary" disabled={submitting} onClick={() => void submit(false)}>{submitting ? "Checking…" : "Submit"}</button>
        </div>
      </div>
    </div>
  );
}

function isAnswered(question: PublicQuestion, answer?: AnswerState) {
  if (!answer) return false;
  if (question.questionType === "multiple_choice") return Boolean(answer.selectedChoiceId);
  if (question.questionType === "identification") return Boolean(answer.identification?.trim());
  if (answer.verdict === "true") return true;
  if (answer.verdict === "false") return Boolean(answer.incorrectPhrase && answer.correction?.trim());
  return false;
}

function QuestionBody({ question, answer, onChange }: { question: PublicQuestion; answer: AnswerState; onChange: (patch: AnswerState) => void }) {
  if (question.questionType === "multiple_choice") {
    return (
      <div>
        <h2 className="mt-3 whitespace-pre-wrap font-display text-3xl leading-tight">{question.questionText}</h2>
        <div className="mt-5 space-y-2" role="radiogroup" aria-label="Answer choices">
          {question.choices.map((choice, choiceIndex) => {
            const selected = answer.selectedChoiceId === choice.id;
            return (
              <label key={choice.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${selected ? "border-navy bg-paper" : "border-line bg-white"}`}>
                <input type="radio" name={question.id} checked={selected} onChange={() => onChange({ selectedChoiceId: choice.id })} />
                <span><span className="mr-2 font-semibold">{String.fromCharCode(65 + choiceIndex)}.</span>{choice.text}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  if (question.questionType === "identification") {
    return (
      <div>
        <h2 className="mt-3 whitespace-pre-wrap font-display text-3xl leading-tight">{question.questionText}</h2>
        <label className="mt-5 block">
          <span className="label">Your answer</span>
          <input className="field" value={answer.identification || ""} autoComplete="off" onChange={(event) => onChange({ identification: event.target.value })} placeholder="Type the term" />
        </label>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mt-3 font-display text-2xl leading-tight">Is this statement true or false according to the lesson?</h2>
      <blockquote className="mt-4 rounded-2xl bg-paper px-4 py-4 text-base leading-7">{question.questionText}</blockquote>
      <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="True or false">
        {(["true", "false"] as const).map((verdict) => (
          <button key={verdict} type="button" className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${answer.verdict === verdict ? "border-navy bg-navy text-white" : "border-line bg-white"}`} onClick={() => onChange({ verdict })} aria-pressed={answer.verdict === verdict}>
            {verdict === "true" ? "True" : "False"}
          </button>
        ))}
      </div>
      {answer.verdict === "false" ? (
        <div className="mt-5 space-y-4">
          <div>
            <p className="label">Which part is incorrect?</p>
            <div className="flex flex-wrap gap-2">
              {question.phraseOptions.map((phrase) => (
                <button key={phrase} type="button" className={`rounded-full border px-3 py-2 text-sm ${answer.incorrectPhrase === phrase ? "border-navy bg-navy text-white" : "border-line bg-white"}`} onClick={() => onChange({ incorrectPhrase: phrase })} aria-pressed={answer.incorrectPhrase === phrase}>
                  {phrase}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="label">What should replace it?</span>
            <input className="field" value={answer.correction || ""} onChange={(event) => onChange({ correction: event.target.value })} placeholder="Type the correction from the lesson" />
          </label>
        </div>
      ) : null}
    </div>
  );
}

import { answersMatch } from "@/lib/text";

export type StoredAnswer =
  | { kind: "unanswered" }
  | { kind: "multiple_choice"; text: string }
  | { kind: "identification"; text: string }
  | { kind: "modified_tf"; verdict: "true" | "false" | ""; incorrectPhrase: string; correction: string };

export type IncomingAnswer = {
  questionId: string;
  selectedChoiceId?: string;
  identification?: string;
  verdict?: "true" | "false";
  incorrectPhrase?: string;
  correction?: string;
};

export type ScoreQuestion = {
  id: string;
  question_type: string;
  correct_answer: string;
  statement_is_true: number | null;
  incorrect_phrase: string | null;
  correct_replacement: string | null;
  acceptable_answers: string;
  choices: { id: string; choice_text: string; is_correct: number }[];
};

export function evaluateAnswer(question: ScoreQuestion, incoming: IncomingAnswer | undefined): { isCorrect: boolean; stored: StoredAnswer } {
  if (!incoming) return { isCorrect: false, stored: { kind: "unanswered" } };

  if (question.question_type === "multiple_choice") {
    const choice = question.choices.find((item) => item.id === incoming.selectedChoiceId);
    if (!choice) return { isCorrect: false, stored: { kind: "unanswered" } };
    return { isCorrect: choice.is_correct === 1, stored: { kind: "multiple_choice", text: choice.choice_text } };
  }

  if (question.question_type === "identification") {
    const text = (incoming.identification || "").trim();
    if (!text) return { isCorrect: false, stored: { kind: "unanswered" } };
    const accepted = parseList(question.acceptable_answers);
    const pool = accepted.length ? accepted : [question.correct_answer];
    return {
      isCorrect: pool.some((answer) => answersMatch(text, answer)),
      stored: { kind: "identification", text },
    };
  }

  const verdict = incoming.verdict;
  if (verdict !== "true" && verdict !== "false") {
    return { isCorrect: false, stored: { kind: "unanswered" } };
  }
  const incorrectPhrase = (incoming.incorrectPhrase || "").trim();
  const correction = (incoming.correction || "").trim();
  if (question.statement_is_true) {
    return {
      isCorrect: verdict === "true",
      stored: { kind: "modified_tf", verdict, incorrectPhrase, correction },
    };
  }
  const accepted = parseList(question.acceptable_answers);
  const phraseOk = Boolean(question.incorrect_phrase) && answersMatch(incorrectPhrase, question.incorrect_phrase || "");
  const correctionOk = [question.correct_replacement || "", ...accepted].some((answer) => answer && answersMatch(correction, answer));
  return {
    isCorrect: verdict === "false" && phraseOk && correctionOk,
    stored: { kind: "modified_tf", verdict, incorrectPhrase, correction },
  };
}

function parseList(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function answerIsBlank(stored: StoredAnswer): boolean {
  return stored.kind === "unanswered";
}

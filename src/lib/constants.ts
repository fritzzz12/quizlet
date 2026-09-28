export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MIN_TEXT_CHARS = 80;
export const MAX_QUESTIONS = 30;
export const MAX_STORED_TEXT = 500_000;

export const QUESTION_TYPES = ["multiple_choice", "modified_tf", "identification"] as const;
export const DIFFICULTIES = ["easy", "moderate", "hard"] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type QuizMode = "quick" | "custom" | "mixed";

export const TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  modified_tf: "Modified true or false",
  identification: "Identification",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  moderate: "Moderate",
  hard: "Hard",
};

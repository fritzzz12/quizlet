import type { Difficulty, QuestionType } from "@/lib/constants";

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  allowExternalKnowledge: boolean;
  defaultTimer: boolean;
  aiConfigured: boolean;
  createdAt: string;
};

export type LessonCard = {
  id: string;
  title: string;
  filename: string;
  fileSize: number;
  pageCount: number;
  summary: string;
  processingStatus: string;
  contentStatus: string;
  failureReason: string | null;
  wordCount: number;
  conceptCount: number;
  maxQuestions: number;
  quizCount: number;
  lastScore: number | null;
  createdAt: string;
};

export type QuizCard = {
  id: string;
  lessonId: string;
  lessonTitle: string;
  title: string;
  mode: string;
  difficulty: string;
  mix: { easy: number; moderate: number; hard: number };
  questionTypes: QuestionType[];
  questionCount: number;
  engine: string;
  generationNote: string;
  lastScore: number | null;
  lastPercentage: number | null;
  attemptCount: number;
  createdAt: string;
};

export type PublicChoice = { id: string; text: string };

export type PublicQuestion = {
  id: string;
  order: number;
  questionText: string;
  questionType: QuestionType;
  choices: PublicChoice[];
  phraseOptions: string[];
};

export type ReviewQuestion = PublicQuestion & {
  difficulty: Difficulty;
  userAnswer: string;
  correctAnswer: string;
  explanation: string;
  sourceReference: string;
  sourceExcerpt: string;
  isCorrect: boolean;
  unanswered: boolean;
  grounded: boolean;
  saved: boolean;
};

export type AttemptReview = {
  id: string;
  quizId: string;
  quizTitle: string;
  lessonId: string;
  lessonTitle: string;
  score: number;
  total: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  timeTakenSeconds: number | null;
  timerEnabled: boolean;
  completedAt: string;
  byDifficulty: Record<string, { correct: number; total: number }>;
  byType: Record<string, { correct: number; total: number }>;
  questions: ReviewQuestion[];
};

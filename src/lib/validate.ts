import type { Difficulty, QuestionType } from "@/lib/constants";
import { containsPhrase, jaccard, norm, normalizeSpace } from "@/lib/text";

export type DraftChoice = { text: string; isCorrect: boolean };

export type DraftQuestion = {
  questionText: string;
  questionType: QuestionType;
  difficulty: Difficulty;
  correctAnswer: string;
  explanation: string;
  sourceReference: string;
  sourceExcerpt: string;
  statementIsTrue: boolean | null;
  incorrectPhrase: string | null;
  correctReplacement: string | null;
  acceptableAnswers: string[];
  choices: DraftChoice[];
  phraseOptions: string[];
  stemKey: string;
  conceptKey: string;
  grounded: boolean;
};

export function validateDraft(
  question: DraftQuestion,
  lessonText: string,
  priorTexts: string[],
  allowExternal: boolean,
): string[] {
  const reasons: string[] = [];
  const lesson = normalizeSpace(lessonText);
  if (question.questionText.trim().length < 20) reasons.push("Question is too short.");
  if (!question.correctAnswer.trim()) reasons.push("Missing correct answer.");
  if (!question.explanation.trim()) reasons.push("Missing explanation.");
  if (!question.sourceExcerpt.trim()) reasons.push("Missing source excerpt.");

  const groundedExcerpt = containsPhrase(lesson, question.sourceExcerpt);
  if (!groundedExcerpt) {
    if (!(allowExternal && question.grounded === false)) reasons.push("Source excerpt is not in the lesson.");
  }
  if (question.grounded && !containsPhrase(lesson, question.correctAnswer) && question.questionType !== "modified_tf") {
    reasons.push("Correct answer is not supported by the lesson.");
  }

  for (const prior of priorTexts) {
    if (norm(prior) === norm(question.questionText) || jaccard(prior, question.questionText) > 0.78) {
      reasons.push("Question repeats an earlier question.");
      break;
    }
  }

  if (question.questionType === "multiple_choice") {
    if (question.choices.length !== 4) reasons.push("Multiple choice needs four choices.");
    const correct = question.choices.filter((choice) => choice.isCorrect);
    if (correct.length !== 1) reasons.push("Multiple choice must have exactly one correct choice.");
    const texts = question.choices.map((choice) => norm(choice.text));
    if (new Set(texts).size !== texts.length) reasons.push("Choices are duplicated.");
    if (correct[0] && norm(correct[0].text) !== norm(question.correctAnswer)) {
      reasons.push("Correct answer does not match the correct choice.");
    }
    for (const choice of question.choices) {
      if (!choice.text.trim() || choice.text.trim().length < 1) reasons.push("Empty choice.");
      if (choice.isCorrect) continue;
      if (norm(choice.text) === norm(question.correctAnswer)) reasons.push("A distractor matches the answer.");
    }
  }

  if (question.questionType === "identification") {
    const folded = norm(question.questionText);
    const answers = [question.correctAnswer, ...question.acceptableAnswers];
    for (const answer of answers) {
      const token = norm(answer);
      if (token.length >= 3 && folded.includes(token)) reasons.push("Identification question reveals the answer.");
    }
    if (question.acceptableAnswers.length === 0 && question.correctAnswer.length < 2) reasons.push("Answer is too short.");
  }

  if (question.questionType === "modified_tf") {
    if (question.statementIsTrue == null) reasons.push("True/false value is missing.");
    if (question.statementIsTrue) {
      if (!containsPhrase(lesson, question.questionText.replace(/\s+/g, " "))) reasons.push("True statement is not in the lesson.");
    } else {
      if (!question.incorrectPhrase || !question.correctReplacement) reasons.push("False statement is missing a correction.");
      if (question.incorrectPhrase && !containsPhrase(question.questionText, question.incorrectPhrase)) {
        reasons.push("Incorrect phrase is not in the statement.");
      }
      if (question.correctReplacement && question.grounded && !containsPhrase(lesson, question.correctReplacement)) {
        reasons.push("Replacement is not supported by the lesson.");
      }
      if (containsPhrase(lesson, question.questionText)) reasons.push("False statement appears verbatim in the lesson.");
      if ((question.phraseOptions || []).length < 3) reasons.push("Not enough phrase choices.");
    }
  }

  if (question.difficulty === "hard") {
    const text = question.questionText.toLowerCase();
    const words = text.split(/\s+/).filter(Boolean).length;
    const hardCue =
      /both|unlike|differ|rather than|instead|correction|classmate|which concept|identify the concept/.test(text) ||
      (question.questionText.match(/\d\./g) || []).length >= 2 ||
      (question.questionType === "modified_tf" && words >= 10);
    if (!hardCue) reasons.push("Hard question does not require deeper reasoning.");
  }

  return reasons;
}

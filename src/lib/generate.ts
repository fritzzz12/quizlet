import { createHash } from "crypto";
import type { Difficulty, QuestionType } from "@/lib/constants";
import { MAX_QUESTIONS } from "@/lib/constants";
import { extractFacts, factMentions, relatedFacts, stripTerm, unrelatedFacts, type Fact } from "@/lib/facts";
import { contentWords, containsPhrase, displayTerm, escapeRegExp, norm, normalizeSpace, shuffle, wordCount } from "@/lib/text";
import { validateDraft, type DraftQuestion } from "@/lib/validate";

export type GenerateInput = {
  lessonText: string;
  pages: string[];
  count: number;
  types: QuestionType[];
  difficultyCounts: Record<Difficulty, number>;
  avoidTexts: string[];
  topic?: string;
  allowExternal?: boolean;
};

export type GenerateResult = {
  questions: DraftQuestion[];
  note: string;
  engine: "grounded" | "language_model";
  conceptCount: number;
  maxSupported: number;
};

export function stemKey(text: string): string {
  return createHash("sha256").update(norm(text)).digest("hex").slice(0, 24);
}

function explanation(fact: Fact, sentence: string): string {
  return `The lesson states: “${normalizeSpace(sentence)}” (${pageLabel(fact.page)}).`;
}

function pageLabel(page: number): string {
  return `Page ${page}`;
}

function conflicts(a: string, b: string): boolean {
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return true;
  return left === right || left.includes(right) || right.includes(left);
}

function otherTerms(facts: Fact[], fact: Fact, count: number): string[] {
  const blocked = [fact.term, ...fact.aliases];
  const pool = facts
    .flatMap((item) => [item.term, ...item.aliases])
    .filter((term) => !blocked.some((blockedTerm) => conflicts(blockedTerm, term)));
  const unique: string[] = [];
  for (const term of pool) {
    if (unique.some((item) => conflicts(item, term))) continue;
    unique.push(displayTerm(term));
    if (unique.length >= count) break;
  }
  return unique;
}

function claimWithoutTerm(fact: Fact, claim: string): string {
  const stripped = stripTerm(claim, fact);
  return stripped.length >= 20 ? stripped : claim;
}

function replaceTerm(sentence: string, term: string, replacement: string): string | null {
  const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
  const match = sentence.match(pattern);
  if (!match) return null;
  const sample = match[0];
  const acronym = /^[A-Z0-9]{2,}/.test(replacement);
  const next = acronym
    ? replacement
    : sample[0] === sample[0].toUpperCase()
      ? displayTerm(replacement)
      : replacement.charAt(0).toLowerCase() + replacement.slice(1);
  const updated = sentence.replace(pattern, next);
  if (containsPhrase(updated, term) && norm(term) !== norm(replacement)) return null;
  return updated;
}

function phraseOptions(statement: string, incorrect: string | null, seed: string): string[] {
  const words = contentWords(statement).slice(0, 6);
  const options = new Set<string>();
  if (incorrect) options.add(incorrect);
  for (const word of words) {
    if (incorrect && norm(word) === norm(incorrect)) continue;
    options.add(word);
    if (options.size >= 4) break;
  }
  const list = [...options];
  if (list.length < 3) return list;
  return shuffle(list, seed).slice(0, 4);
}

function base(fact: Fact, difficulty: Difficulty, type: QuestionType, text: string, answer: string): Omit<DraftQuestion, "choices" | "phraseOptions" | "statementIsTrue" | "incorrectPhrase" | "correctReplacement"> {
  const sentence = fact.sentences[0] || `${fact.term} ${fact.claims[0]}`;
  return {
    questionText: text,
    questionType: type,
    difficulty,
    correctAnswer: answer,
    explanation: explanation(fact, sentence),
    sourceReference: pageLabel(fact.page),
    sourceExcerpt: normalizeSpace(sentence).slice(0, 320),
    acceptableAnswers: [fact.term, ...fact.aliases].map((item) => displayTerm(item)),
    stemKey: stemKey(text),
    conceptKey: norm(fact.term),
    grounded: true,
  };
}

function buildEasyMc(fact: Fact, facts: Fact[]): DraftQuestion | null {
  const claim = claimWithoutTerm(fact, fact.claims[0]);
  const distractors = otherTerms(facts, fact, 3);
  if (distractors.length < 3 || norm(claim).includes(norm(fact.term))) return null;
  const answer = displayTerm(fact.term);
  const text = `Which of the following matches this description from the lesson?\n\n${claim}`;
  const choices = shuffle(
    [{ text: answer, isCorrect: true }, ...distractors.map((item) => ({ text: item, isCorrect: false }))],
    text,
  );
  return { ...base(fact, "easy", "multiple_choice", text, answer), choices, phraseOptions: [], statementIsTrue: null, incorrectPhrase: null, correctReplacement: null };
}

function buildModerateMc(fact: Fact, facts: Fact[]): DraftQuestion | null {
  const correct = claimWithoutTerm(fact, fact.claims[0]);
  const distractors = facts
    .filter((other) => norm(other.term) !== norm(fact.term))
    .map((other) => claimWithoutTerm(other, other.claims[0]))
    .filter((claim) => claim.length >= 20 && claim.length < 180)
    .filter((claim, index, list) => list.findIndex((item) => norm(item) === norm(claim)) === index)
    .filter((claim) => !fact.sentences.some((sentence) => containsPhrase(sentence, claim)))
    .slice(0, 3);
  if (distractors.length < 3) return null;
  const text = `Which statement about ${displayTerm(fact.term)} is supported by the lesson?`;
  const choices = shuffle(
    [{ text: correct, isCorrect: true }, ...distractors.map((item) => ({ text: item, isCorrect: false }))],
    `${text}:${fact.term}`,
  );
  return {
    ...base(fact, "moderate", "multiple_choice", text, correct),
    choices,
    phraseOptions: [],
    statementIsTrue: null,
    incorrectPhrase: null,
    correctReplacement: null,
    acceptableAnswers: [correct],
  };
}

function buildHardMc(fact: Fact, facts: Fact[]): DraftQuestion | null {
  if (fact.claims.length < 2) return null;
  const first = claimWithoutTerm(fact, fact.claims[0]);
  const second = claimWithoutTerm(fact, fact.claims[1]);
  if (norm(first) === norm(second)) return null;
  const distractors = otherTerms(facts, fact, 3);
  if (distractors.length < 3) return null;
  const answer = displayTerm(fact.term);
  const text = `Which concept does both of the following, according to the lesson?\n1. ${first}\n2. ${second}`;
  const unique = facts.filter((other) => {
    if (norm(other.term) === norm(fact.term)) return false;
    return factMentions(other, first) && factMentions(other, second);
  });
  if (unique.length) return null;
  const choices = shuffle(
    [{ text: answer, isCorrect: true }, ...distractors.map((item) => ({ text: item, isCorrect: false }))],
    text,
  );
  return { ...base(fact, "hard", "multiple_choice", text, answer), choices, phraseOptions: [], statementIsTrue: null, incorrectPhrase: null, correctReplacement: null };
}

function clue(claim: string): string {
  const verbLed = /^(connects|forwards|converts|monitors|translates|describes|handles|provides|uses|covers|spans|guarantees|controls|filters|routes|assigns|examines|prevents|allows|stores|sends|receives|defines|contains|includes|supports|transfers|identifies|maps|resolves|secures|blocks|delivers|transmits|carries)\b/i.test(claim);
  const body = `${claim.charAt(0).toLowerCase()}${claim.slice(1)}`;
  return verbLed ? `the concept that ${body}` : `the concept described as ${body}`;
}

function buildEasyId(fact: Fact): DraftQuestion | null {
  const claim = claimWithoutTerm(fact, fact.claims[0]);
  if (norm(claim).includes(norm(fact.term))) return null;
  const text = `Identify ${clue(claim)}.`;
  const answer = displayTerm(fact.term);
  return { ...base(fact, "easy", "identification", text, answer), choices: [], phraseOptions: [], statementIsTrue: null, incorrectPhrase: null, correctReplacement: null };
}

function buildModerateId(fact: Fact, facts: Fact[]): DraftQuestion | null {
  const other = relatedFacts(fact, facts)[0] || facts.find((item) => norm(item.term) !== norm(fact.term));
  if (!other) return null;
  const claim = claimWithoutTerm(fact, fact.claims[0]);
  if (norm(claim).includes(norm(fact.term)) || norm(claim).includes(norm(other.term))) return null;
  const text = `${displayTerm(other.term)} is a different concept in this lesson. Identify ${clue(claim)}.`;
  const answer = displayTerm(fact.term);
  return { ...base(fact, "moderate", "identification", text, answer), choices: [], phraseOptions: [], statementIsTrue: null, incorrectPhrase: null, correctReplacement: null };
}

function buildHardId(fact: Fact): DraftQuestion | null {
  if (fact.claims.length < 2) return null;
  const first = claimWithoutTerm(fact, fact.claims[0]);
  const second = claimWithoutTerm(fact, fact.claims[1]);
  const text = `Identify the concept that does both of the following, according to the lesson.\n1. ${first}\n2. ${second}`;
  const answer = displayTerm(fact.term);
  if (norm(text).includes(norm(answer))) return null;
  return { ...base(fact, "hard", "identification", text, answer), choices: [], phraseOptions: [], statementIsTrue: null, incorrectPhrase: null, correctReplacement: null };
}

function trueStatement(fact: Fact, difficulty: Difficulty): DraftQuestion | null {
  const sentence = fact.sentences.find((item) => containsPhrase(item, fact.term)) || fact.sentences[0];
  if (!sentence) return null;
  const text = sentence.endsWith(".") ? sentence : `${sentence}.`;
  const draft: DraftQuestion = {
    ...base(fact, difficulty, "modified_tf", text, "True"),
    choices: [],
    phraseOptions: phraseOptions(text, null, text),
    statementIsTrue: true,
    incorrectPhrase: null,
    correctReplacement: null,
    acceptableAnswers: ["True"],
  };
  return draft;
}

function falseSwap(fact: Fact, replacementFact: Fact, difficulty: Difficulty): DraftQuestion | null {
  const sentence = fact.sentences.find((item) => new RegExp(`\\b${escapeRegExp(fact.term)}\\b`, "i").test(item));
  if (!sentence) return null;
  const swapped = replaceTerm(sentence, fact.term, replacementFact.term);
  if (!swapped) return null;
  const text = swapped.endsWith(".") ? swapped : `${swapped}.`;
  const shown = text.match(new RegExp(`\\b${escapeRegExp(displayTerm(replacementFact.term))}\\b`, "i"))?.[0]
    || text.match(new RegExp(`\\b${escapeRegExp(replacementFact.term)}\\b`, "i"))?.[0];
  if (!shown) return null;
  const options = phraseOptions(text, shown, text);
  if (options.length < 3) return null;
  return {
    ...base(fact, difficulty, "modified_tf", text, `False. Replace “${shown}” with “${displayTerm(fact.term)}”.`),
    choices: [],
    phraseOptions: options,
    statementIsTrue: false,
    incorrectPhrase: shown,
    correctReplacement: displayTerm(fact.term),
    acceptableAnswers: [fact.term, ...fact.aliases].map((item) => displayTerm(item)),
  };
}

function buildMtf(fact: Fact, facts: Fact[], difficulty: Difficulty, preferFalse: boolean): DraftQuestion | null {
  if (preferFalse) {
    const related = difficulty === "easy" ? unrelatedFacts(fact, facts) : relatedFacts(fact, facts);
    const replacement = related[0] || (difficulty === "hard" ? undefined : facts.find((item) => norm(item.term) !== norm(fact.term)));
    if (replacement) {
      const source = difficulty === "hard" ? { ...fact, sentences: [...fact.sentences].sort((a, b) => b.length - a.length) } : fact;
      const swapped = falseSwap(source, replacement, difficulty);
      if (swapped && (difficulty !== "hard" || swapped.questionText.split(/\s+/).length >= 10)) return swapped;
    }
    if (difficulty === "hard") return null;
  }
  if (difficulty === "hard") {
    const sentence = [...fact.sentences]
      .sort((a, b) => b.length - a.length)
      .find((item) => item.split(/\s+/).length >= 10 && containsPhrase(item, fact.term));
    if (!sentence) return null;
    return trueStatement({ ...fact, sentences: [sentence] }, "hard");
  }
  return trueStatement(fact, difficulty);
}

const BUILDERS: Record<QuestionType, Record<Difficulty, (fact: Fact, facts: Fact[], preferFalse: boolean) => DraftQuestion | null>> = {
  multiple_choice: {
    easy: (fact, facts) => buildEasyMc(fact, facts),
    moderate: (fact, facts) => buildModerateMc(fact, facts),
    hard: (fact, facts) => buildHardMc(fact, facts),
  },
  identification: {
    easy: (fact) => buildEasyId(fact),
    moderate: (fact, facts) => buildModerateId(fact, facts),
    hard: (fact) => buildHardId(fact),
  },
  modified_tf: {
    easy: (fact, facts, preferFalse) => buildMtf(fact, facts, "easy", preferFalse),
    moderate: (fact, facts, preferFalse) => buildMtf(fact, facts, "moderate", preferFalse),
    hard: (fact, facts, preferFalse) => buildMtf(fact, facts, "hard", preferFalse),
  },
};

export function lessonCapacity(facts: Fact[], lessonWordCount: number): number {
  if (facts.length < 2) return 0;
  const byFacts = facts.length * 2;
  const byWords = Math.floor(lessonWordCount / 30);
  return Math.max(1, Math.min(MAX_QUESTIONS, byFacts, Math.max(facts.length, byWords)));
}

function filterByTopic(facts: Fact[], topic?: string): { facts: Fact[]; narrowed: boolean } {
  const tokens = norm(topic || "").split(" ").filter((token) => token.length > 2);
  if (!tokens.length) return { facts, narrowed: false };
  const matched = facts.filter((fact) => {
    const haystack = norm([fact.term, ...fact.aliases, ...fact.claims].join(" "));
    return tokens.some((token) => haystack.includes(token));
  });
  if (matched.length >= 2) return { facts: matched, narrowed: true };
  return { facts, narrowed: false };
}

function slotsFor(counts: Record<Difficulty, number>, types: QuestionType[]): { difficulty: Difficulty; type: QuestionType }[] {
  const slots: { difficulty: Difficulty; type: QuestionType }[] = [];
  (["easy", "moderate", "hard"] as Difficulty[]).forEach((difficulty) => {
    for (let index = 0; index < counts[difficulty]; index++) slots.push({ difficulty, type: types[slots.length % types.length] });
  });
  return slots;
}

export function allocateCounts(total: number, mix: Record<Difficulty, number>): Record<Difficulty, number> {
  const entries = (["easy", "moderate", "hard"] as Difficulty[]).map((difficulty) => ({
    difficulty,
    raw: (total * mix[difficulty]) / 100,
  }));
  const counts = { easy: 0, moderate: 0, hard: 0 };
  let used = 0;
  for (const entry of entries) {
    counts[entry.difficulty] = Math.floor(entry.raw);
    used += counts[entry.difficulty];
  }
  const ranked = [...entries].sort((a, b) => b.raw - Math.floor(b.raw) - (a.raw - Math.floor(a.raw)));
  let leftover = total - used;
  let cursor = 0;
  while (leftover > 0 && ranked.length) {
    counts[ranked[cursor % ranked.length].difficulty] += 1;
    leftover -= 1;
    cursor += 1;
  }
  return counts;
}

export function generateGroundedQuestions(input: GenerateInput): GenerateResult {
  const allFacts = extractFacts(input.pages.length ? input.pages : [input.lessonText]);
  const topic = filterByTopic(allFacts, input.topic);
  const facts = topic.facts;
  const maxSupported = lessonCapacity(allFacts, wordCount(input.lessonText));
  const notes: string[] = [];
  if (input.topic && !topic.narrowed) notes.push("That topic was too narrow for this lesson, so the quiz uses the full lesson.");
  if (!facts.length || maxSupported === 0) {
    return { questions: [], note: "This lesson does not contain enough readable concepts to build a reliable quiz.", engine: "grounded", conceptCount: allFacts.length, maxSupported: 0 };
  }

  const requested = Math.min(input.count, maxSupported, MAX_QUESTIONS);
  if (requested < input.count) {
    notes.push(`This lesson can support ${requested} reliable question${requested === 1 ? "" : "s"}, so the quiz was shortened from ${input.count}.`);
  }

  const given = input.difficultyCounts;
  const givenSum = given.easy + given.moderate + given.hard;
  const mix = {
    easy: givenSum ? (given.easy / givenSum) * 100 : 34,
    moderate: givenSum ? (given.moderate / givenSum) * 100 : 33,
    hard: givenSum ? (given.hard / givenSum) * 100 : 33,
  };
  const counts = allocateCounts(requested, mix);
  const planned = slotsFor(counts, input.types);
  const questions: DraftQuestion[] = [];
  const usedTexts = [...input.avoidTexts];
  const usedConcepts = new Set<string>();

  for (const slot of planned) {
    const preferFalse = questions.filter((item) => item.questionType === "modified_tf").length % 2 === 0;
    const ordered = [...facts].sort((a, b) => Number(usedConcepts.has(norm(a.term))) - Number(usedConcepts.has(norm(b.term))) || a.page - b.page || a.term.localeCompare(b.term));
    let created: DraftQuestion | null = null;
    for (const fact of ordered) {
      const draft = BUILDERS[slot.type][slot.difficulty](fact, facts, preferFalse);
      if (!draft) continue;
      const reasons = validateDraft(draft, input.lessonText, usedTexts, false);
      if (reasons.length) continue;
      created = draft;
      break;
    }
    if (!created) continue;
    questions.push(created);
    usedTexts.push(created.questionText);
    usedConcepts.add(created.conceptKey);
  }

  if (questions.length < requested) {
    notes.push(`Generated ${questions.length} question${questions.length === 1 ? "" : "s"} that passed validation. Some requested items were skipped because the lesson did not support them without repeating or guessing.`);
  }

  return {
    questions,
    note: notes.filter(Boolean).join(" "),
    engine: "grounded",
    conceptCount: allFacts.length,
    maxSupported,
  };
}

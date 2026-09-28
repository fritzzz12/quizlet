import { extractText, getDocumentProxy } from "unpdf";
import { extractFacts } from "@/lib/facts";
import { lessonCapacity } from "@/lib/generate";
import { alphanumericCount, displayTerm, normalizeSpace, wordCount } from "@/lib/text";
import { MIN_TEXT_CHARS } from "@/lib/constants";

export function isPdfBuffer(data: Uint8Array): boolean {
  return data.length >= 5 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46;
}

function cleanPage(text: string): string {
  return text
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractPdf(data: Uint8Array): Promise<{ pageCount: number; pages: string[] }> {
  const pdf = await getDocumentProxy(data);
  try {
    const result = await extractText(pdf, { mergePages: false });
    const raw = Array.isArray(result.text) ? result.text : [String(result.text || "")];
    const pages = raw.map((page) => cleanPage(String(page || "")));
    const pageCount = Number(result.totalPages || pages.length || 0);
    return { pageCount, pages };
  } finally {
    const closable = pdf as { destroy?: () => Promise<void> | void };
    await closable.destroy?.();
  }
}

export function inferTitle(filename: string, pages: string[]): string {
  const firstLine = pages
    .flatMap((page) => page.split(/\n+/))
    .map((line) => line.trim())
    .find((line) => line.length >= 4 && line.length <= 80 && !/[.!?]$/.test(line) && line.split(/\s+/).length <= 12);
  if (firstLine) return firstLine;
  const fromFile = filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
  return fromFile || "Untitled lesson";
}

export function buildSummary(pages: string[]): string {
  const facts = extractFacts(pages);
  if (facts.length) {
    return facts
      .slice(0, 4)
      .map((fact) => `${displayTerm(fact.term)}: ${fact.claims[0]}`)
      .join(" ");
  }
  return normalizeSpace(pages.join(" ")).slice(0, 420);
}

export function inspectLesson(pages: string[]): {
  contentStatus: "readable" | "insufficient" | "unreadable";
  failureReason: string | null;
  wordCount: number;
  conceptCount: number;
  maxQuestions: number;
  summary: string;
} {
  const text = pages.join("\n");
  const letters = alphanumericCount(text);
  const facts = extractFacts(pages);
  const words = wordCount(text);
  const maxQuestions = lessonCapacity(facts, words);
  if (letters < 20) {
    return {
      contentStatus: "unreadable",
      failureReason: "No readable text was found. If this is a scanned PDF, export a text-based PDF and upload it again.",
      wordCount: words,
      conceptCount: facts.length,
      maxQuestions: 0,
      summary: "",
    };
  }
  if (letters < MIN_TEXT_CHARS || facts.length < 2 || maxQuestions < 1) {
    return {
      contentStatus: "insufficient",
      failureReason: "The PDF has some text, but not enough clear concepts to generate reliable questions.",
      wordCount: words,
      conceptCount: facts.length,
      maxQuestions: 0,
      summary: buildSummary(pages),
    };
  }
  return {
    contentStatus: "readable",
    failureReason: null,
    wordCount: words,
    conceptCount: facts.length,
    maxQuestions,
    summary: buildSummary(pages),
  };
}

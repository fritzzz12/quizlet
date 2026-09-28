export function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function norm(value: string): string {
  return normalizeSpace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function singular(value: string): string {
  const text = norm(value);
  if (text.endsWith("sses")) return text.slice(0, -2);
  if (text.endsWith("ies")) return `${text.slice(0, -3)}y`;
  if (text.endsWith("s") && !text.endsWith("ss") && text.length > 3) return text.slice(0, -1);
  return text;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[b.length];
}

export function answersMatch(input: string, expected: string): boolean {
  const a = norm(input);
  const b = norm(expected);
  if (!a || !b) return false;
  if (a === b || singular(a) === singular(b)) return true;
  if (Math.abs(a.length - b.length) > 4) return false;
  const distance = levenshtein(a, b);
  const limit = a.length <= 5 ? 1 : 2;
  return distance <= limit && distance / Math.max(a.length, b.length) <= 0.18;
}

export function jaccard(a: string, b: string): number {
  const left = new Set(norm(a).split(" ").filter((word) => word.length > 2));
  const right = new Set(norm(b).split(" ").filter((word) => word.length > 2));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const word of left) if (right.has(word)) overlap += 1;
  return overlap / (left.size + right.size - overlap);
}

export function wordCount(value: string): number {
  return norm(value).split(" ").filter(Boolean).length;
}

export function alphanumericCount(value: string): number {
  return (value.match(/[A-Za-z0-9]/g) || []).length;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsPhrase(haystack: string, needle: string): boolean {
  const text = normalizeSpace(haystack).toLowerCase();
  const phrase = normalizeSpace(needle).toLowerCase();
  return phrase.length > 0 && text.includes(phrase);
}

export function displayTerm(term: string): string {
  const clean = normalizeSpace(term);
  if (!clean) return clean;
  if (/^[A-Z0-9]{2,}(\b|$)/.test(clean)) return clean;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function seededRandom(seedText: string): () => number {
  let seed = 2166136261;
  for (const char of seedText) {
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  }
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function shuffle<T>(items: T[], seedText: string): T[] {
  const copy = [...items];
  const random = seededRandom(seedText);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const STOPWORDS = new Set(
  "a an the of and or to in on for with that this from by is are was were be as at it its into over between based using which what when where who whom whose than then so if not no yes can may also such their there these those into within without across per via about than".split(
    " ",
  ),
);

export function contentWords(value: string): string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const word of normalizeSpace(value).split(" ")) {
    const cleaned = word.replace(/^[^\w]+|[^\w]+$/g, "");
    const key = cleaned.toLowerCase();
    if (cleaned.length < 4 || STOPWORDS.has(key) || seen.has(key)) continue;
    seen.add(key);
    words.push(cleaned);
  }
  return words;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins <= 0) return `${secs} sec`;
  return `${mins} min ${secs.toString().padStart(2, "0")} sec`;
}

export function splitSentences(text: string): string[] {
  const cleaned = normalizeSpace(text).replace(/([a-z0-9])\s+(?=(?:A|An|The)\s+)/g, "$1. ");
  if (!cleaned) return [];
  return cleaned
    .split(/(?<=[.!?])\s+(?=(?:[A-Z]|["“]))/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 28 && sentence.length <= 420 && /[a-zA-Z]/.test(sentence));
}

export function joinPages(pages: string[]): string {
  return pages.map((page, index) => `--- Page ${index + 1} ---\n${page.trim()}`).join("\n\n");
}

export function pagesFromStored(text: string): string[] {
  const parts = text.split(/--- Page \d+ ---/).map((part) => part.trim());
  const pages = parts.filter(Boolean);
  return pages.length ? pages : [text];
}

export function findPage(excerpt: string, pages: string[]): number {
  const needle = normalizeSpace(excerpt).toLowerCase().slice(0, 90);
  if (!needle) return 1;
  for (let index = 0; index < pages.length; index++) {
    if (normalizeSpace(pages[index]).toLowerCase().includes(needle)) return index + 1;
  }
  return 1;
}

import { contentWords, escapeRegExp, norm, normalizeSpace, splitSentences } from "@/lib/text";

export type Fact = {
  term: string;
  aliases: string[];
  claims: string[];
  sentences: string[];
  page: number;
};

const STOP_TERMS = new Set(
  "introduction chapter figure table page section summary overview example note copyright abstract contents index lesson unit module objective objectives conclusion references appendix".split(
    " ",
  ),
);

const VERB =
  "connects|forwards|converts|monitors|translates|describes|handles|provides|uses|covers|spans|guarantees|controls|filters|routes|assigns|examines|prevents|allows|stores|sends|receives|defines|contains|includes|supports|transfers|encapsulates|identifies|maps|resolves|secures|blocks|delivers|organizes|divides|separates|combines|measures|represents|specifies|requires|ensures|maintains|transmits|carries|links|joins|passes|protects|checks|compares|selects|determines|chooses";

type Parsed = { term: string; aliases: string[]; claim: string };

function cleanTerm(value: string): string {
  return normalizeSpace(value).replace(/^(a|an|the)\s+/i, "").replace(/[.:;]+$/g, "");
}

function acceptableTerm(term: string): boolean {
  const key = norm(term);
  if (!key || key.length < 2 || key.length > 60) return false;
  if (key.split(" ").length > 6) return false;
  if (/\b(a|an|the)\b/.test(key)) return false;
  if (STOP_TERMS.has(key)) return false;
  if (!/[a-z]/i.test(term)) return false;
  return true;
}

function asFact(termRaw: string, claimRaw: string, aliases: string[] = []): Parsed | null {
  const term = cleanTerm(termRaw);
  const claim = normalizeSpace(claimRaw).replace(/[.]+$/g, "");
  if (!acceptableTerm(term) || claim.length < 20) return null;
  return { term, aliases: aliases.map(cleanTerm).filter(acceptableTerm), claim };
}

function parseSentence(sentence: string): Parsed | null {
  const text = sentence.replace(/\s+/g, " ").trim().replace(/[.]+$/g, "");

  const articleAlias = text.match(/^(?:A|An|The)\s+(.+?),\s+or\s+([^,]+),\s+(.+)$/i);
  if (articleAlias) return asFact(articleAlias[1], articleAlias[3], [articleAlias[2]]);

  const bareAlias = text.match(/^([A-Z][A-Za-z0-9/&+\- ]{1,48}?),\s+or\s+([^,]+),\s+(.+)$/);
  if (bareAlias) return asFact(bareAlias[1], bareAlias[3], [bareAlias[2]]);

  const articleIs = text.match(/^(?:A|An|The)\s+(.+?)\s+(is|are|was|were|means|refers to)\s+(.+)$/i);
  if (articleIs) return asFact(articleIs[1], articleIs[3]);

  const bareIs = text.match(/^([A-Z][A-Za-z0-9/&+\- ]{1,48}?)\s+(is|are|was|were|means|refers to)\s+(.+)$/);
  if (bareIs) return asFact(bareIs[1], bareIs[3]);

  const articleVerb = text.match(new RegExp(`^(?:A|An|The)\\s+(.+?)\\s+(${VERB})\\s+(.+)$`, "i"));
  if (articleVerb) return asFact(articleVerb[1], `${articleVerb[2].toLowerCase()} ${articleVerb[3]}`);

  const bareVerb = text.match(new RegExp(`^([A-Z][A-Za-z0-9/&+\\- ]{1,40}?)\\s+(${VERB})\\s+(.+)$`));
  if (bareVerb) return asFact(bareVerb[1], `${bareVerb[2].toLowerCase()} ${bareVerb[3]}`);

  const glossary = text.match(/^([A-Z][A-Za-z0-9/&+\- ]{2,40})\s*[:–—-]\s+(.{20,})$/);
  if (glossary) return asFact(glossary[1], glossary[2]);
  return null;
}

function addUnique(list: string[], value: string) {
  const next = normalizeSpace(value);
  if (!next) return;
  if (list.some((item) => norm(item) === norm(next))) return;
  list.push(next);
}

export function extractFacts(pages: string[]): Fact[] {
  const map = new Map<string, Fact>();
  let lastKey: string | null = null;

  pages.forEach((pageText, index) => {
    const page = index + 1;
    const sentences = splitSentences(pageText);

    for (const sentence of sentences) {
      const anaphora = sentence.match(/^(It|They|This|These)\b\s+(.+)/i);
      if (anaphora && lastKey && map.has(lastKey)) {
        const fact = map.get(lastKey)!;
        const predicate = normalizeSpace(anaphora[2]).replace(/[.]+$/g, "");
        if (predicate.length >= 20) addUnique(fact.claims, predicate);
        continue;
      }

      const parsed = parseSentence(sentence);
      if (!parsed) continue;
      const key = norm(parsed.term);
      let fact = map.get(key);
      if (!fact) {
        fact = { term: parsed.term, aliases: [], claims: [], sentences: [], page };
        map.set(key, fact);
      }
      for (const alias of parsed.aliases) addUnique(fact.aliases, alias);
      addUnique(fact.claims, parsed.claim);
      addUnique(fact.sentences, sentence.endsWith(".") ? sentence : `${sentence}.`);
      lastKey = key;
    }
  });

  return [...map.values()].filter((fact) => fact.claims.some((claim) => claim.length >= 24 && contentWords(claim).length >= 3));
}

export function stripTerm(text: string, fact: Fact): string {
  let result = text;
  for (const term of [fact.term, ...fact.aliases].sort((a, b) => b.length - a.length)) {
    result = result.replace(new RegExp(`\\b${escapeRegExp(term)}\\b`, "ig"), "").replace(/\s{2,}/g, " ").trim();
  }
  return result.replace(/^[,:;-]+\s*/, "").trim();
}

export function factMentions(fact: Fact, phrase: string): boolean {
  const haystack = norm([fact.term, ...fact.aliases, ...fact.claims, ...fact.sentences].join(" "));
  return haystack.includes(norm(phrase));
}

const GENERIC_WORDS = new Set("computer network networks system data information device devices layer model address addresses based using within between different multiple".split(" "));

export function relatedFacts(fact: Fact, facts: Fact[]): Fact[] {
  const words = new Set(
    contentWords(fact.claims.join(" "))
      .map((word) => word.toLowerCase())
      .filter((word) => word.length > 4 && !GENERIC_WORDS.has(word)),
  );
  return facts
    .filter((other) => norm(other.term) !== norm(fact.term))
    .map((other) => {
      const otherWords = contentWords(other.claims.join(" "))
        .map((word) => word.toLowerCase())
        .filter((word) => word.length > 4 && !GENERIC_WORDS.has(word));
      const shared = otherWords.filter((word) => words.has(word)).length;
      const samePage = other.page === fact.page ? 1 : 0;
      return { other, score: shared * 2 + samePage };
    })
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.other);
}

export function unrelatedFacts(fact: Fact, facts: Fact[]): Fact[] {
  const related = new Set(relatedFacts(fact, facts).map((item) => norm(item.term)));
  return facts.filter((other) => norm(other.term) !== norm(fact.term) && !related.has(norm(other.term)));
}

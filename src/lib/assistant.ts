import { extractFacts } from "@/lib/facts";
import { aiConfigured, chatCompletion, lessonPacket } from "@/lib/llm";
import { displayTerm, normalizeSpace, splitSentences } from "@/lib/text";

export type AssistantResult = {
  reply: string;
  references: { page: number; excerpt: string }[];
  suggestedTopic?: string;
};

type Message = { role: "user" | "assistant"; content: string };

function referencesFor(pages: string[], tokens: string[]) {
  const found: { page: number; excerpt: string; score: number }[] = [];
  pages.forEach((page, index) => {
    for (const sentence of splitSentences(page)) {
      const haystack = sentence.toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
      if (score > 0) found.push({ page: index + 1, excerpt: normalizeSpace(sentence).slice(0, 280), score });
    }
  });
  return found.sort((a, b) => b.score - a.score).slice(0, 3);
}

function localAnswer(title: string, pages: string[], question: string, allowExternal: boolean): AssistantResult {
  const facts = extractFacts(pages);
  const tokens = question.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 3);
  const refs = referencesFor(pages, tokens);
  const quiz = /quiz|test me|practice questions/i.test(question);
  const topic = question.match(/(?:about|on|regarding)\s+([a-z0-9][^?.!]{2,60})/i)?.[1]?.trim();
  if (quiz) {
    return {
      reply: topic
        ? `I can build another quiz from “${title}” focused on ${topic}. Open the quiz generator and I will stay inside this lesson.`
        : `I can build another quiz from “${title}”. Open the quiz generator to choose a difficulty, question types, and how many questions you want.`,
      references: refs.map(({ page, excerpt }) => ({ page, excerpt })),
      suggestedTopic: topic,
    };
  }
  if (/important concept|key term|what should i review|topics/i.test(question)) {
    const lines = facts.slice(0, 6).map((fact) => `• ${displayTerm(fact.term)} — ${fact.claims[0]}`);
    return {
      reply: lines.length ? `These ideas carry the most weight in “${title}”:\n\n${lines.join("\n")}` : "I could not find enough defined concepts in this lesson yet.",
      references: facts.slice(0, 3).map((fact) => ({ page: fact.page, excerpt: fact.sentences[0] || fact.claims[0] })),
    };
  }
  if (/summar/i.test(question)) {
    const lines = facts.slice(0, 5).map((fact) => `${displayTerm(fact.term)} ${fact.claims[0].charAt(0).toLowerCase()}${fact.claims[0].slice(1)}`);
    return {
      reply: lines.length ? `${title} centers on these ideas. ${lines.join(". ")}.` : "The lesson does not have enough readable text to summarize.",
      references: facts.slice(0, 3).map((fact) => ({ page: fact.page, excerpt: fact.sentences[0] || fact.claims[0] })),
    };
  }
  if (/example/i.test(question)) {
    const examples = pages.flatMap((page, index) =>
      splitSentences(page)
        .filter((sentence) => /for example|for instance|such as|e\.g\./i.test(sentence))
        .map((excerpt) => ({ page: index + 1, excerpt: normalizeSpace(excerpt) })),
    );
    if (!examples.length && !allowExternal) {
      return { reply: "This lesson does not include explicit examples, so I will not invent any.", references: [] };
    }
    return {
      reply: examples.length ? `Here are examples stated in the lesson:\n\n${examples.slice(0, 3).map((item) => `• ${item.excerpt}`).join("\n")}` : "I could not find examples in the lesson.",
      references: examples.slice(0, 3),
    };
  }
  const chapter = question.match(/chapter\s+(\d+)|page\s+(\d+)/i);
  if (chapter) {
    const pageNumber = Number(chapter[2] || chapter[1]);
    const page = pages[pageNumber - 1];
    if (!page) return { reply: `I could not find page ${pageNumber} in this lesson.`, references: [] };
    return {
      reply: `Here is the part of “${title}” from page ${pageNumber}:\n\n${normalizeSpace(page).slice(0, 700)}`,
      references: [{ page: pageNumber, excerpt: normalizeSpace(page).slice(0, 240) }],
    };
  }
  if (!refs.length && !allowExternal) {
    return {
      reply: "I could not find an answer to that in the uploaded lesson, so I will not fill the gap with outside knowledge.",
      references: [],
    };
  }
  const simple = /simple|explain|eli5|plain/i.test(question);
  if (simple && facts.length) {
    const lines = facts.slice(0, 5).map((fact) => `${displayTerm(fact.term)}: ${fact.claims[0]}`);
    return {
      reply: `In plain language, “${title}” says:\n\n${lines.join("\n")}`,
      references: facts.slice(0, 3).map((fact) => ({ page: fact.page, excerpt: fact.sentences[0] || fact.claims[0] })),
    };
  }
  const bullets = refs.map((ref) => `• ${ref.excerpt}`).join("\n");
  return {
    reply: bullets ? `From the lesson:\n\n${bullets}` : "I stayed inside the lesson and could not find a matching passage.",
    references: refs.map(({ page, excerpt }) => ({ page, excerpt })),
  };
}

export async function answerStudyQuestion(input: {
  title: string;
  pages: string[];
  question: string;
  history: Message[];
  allowExternal: boolean;
}): Promise<AssistantResult> {
  if (!aiConfigured()) return localAnswer(input.title, input.pages, input.question, input.allowExternal);
  try {
    const content = await chatCompletion([
      {
        role: "system",
        content: input.allowExternal
          ? "You are a study tutor. Prefer the lesson. You may add a short general note only after the lesson-based answer, clearly labeled Outside the lesson. Cite page numbers."
          : "You are a study tutor. Answer only from the lesson. If the lesson does not contain the answer, say so and do not invent it. Cite page numbers when you use a passage.",
      },
      {
        role: "user",
        content: `Lesson title: ${input.title}\n\n${lessonPacket(input.pages)}\n\nConversation:\n${input.history.map((item) => `${item.role}: ${item.content}`).join("\n")}\n\nQuestion: ${input.question}`,
      },
    ]);
    const tokens = input.question.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 3);
    const refs = referencesFor(input.pages, tokens);
    const topic = /quiz|test me/i.test(input.question) ? input.question.match(/(?:about|on|regarding)\s+([a-z0-9][^?.!]{2,60})/i)?.[1]?.trim() : undefined;
    return { reply: content.trim(), references: refs.map(({ page, excerpt }) => ({ page, excerpt })), suggestedTopic: topic };
  } catch {
    return localAnswer(input.title, input.pages, input.question, input.allowExternal);
  }
}

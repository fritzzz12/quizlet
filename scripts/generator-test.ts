import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractFacts } from "../src/lib/facts";
import { allocateCounts, generateGroundedQuestions } from "../src/lib/generate";
import { extractPdf } from "../src/lib/pdf";
import { evaluateAnswer } from "../src/lib/score";
import { validateDraft } from "../src/lib/validate";
import { norm } from "../src/lib/text";

const lesson = `Computer Networks

A computer network is a collection of connected devices that share data and resources.

A switch connects multiple computers within a local network. It forwards frames based on MAC addresses.

A router forwards packets between different networks based on IP addresses. It uses routing tables to choose a path.

A modem converts digital signals from a computer into analog signals for transmission over telephone or cable lines.

A firewall monitors and controls incoming and outgoing network traffic based on security rules.

The OSI model describes network communication in seven layers. The physical layer transmits raw bits over a medium. The data link layer handles frames and MAC addresses.

An IP address is a numerical label assigned to each device on a network. DNS, or Domain Name System, translates human-readable domain names into IP addresses.

TCP is a connection-oriented protocol that guarantees reliable ordered delivery of data. UDP is a connectionless protocol that does not guarantee delivery.

A local area network, or LAN, covers a small geographic area such as a home or office. A wide area network, or WAN, spans a large geographic area and often connects multiple local networks.`;

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function makePdf(text: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const chunks = text.split(/\n\n+/);
  let page = doc.addPage([612, 792]);
  let y = 740;
  for (const chunk of chunks) {
    const words = chunk.replace(/\n/g, " ").split(/\s+/);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, 12) > 500) {
        page.drawText(line, { x: 54, y, size: 12, font });
        y -= 18;
        line = word;
        if (y < 72) {
          page = doc.addPage([612, 792]);
          y = 740;
        }
      } else line = next;
    }
    if (line) {
      page.drawText(line, { x: 54, y, size: 12, font });
      y -= 28;
    }
    if (y < 72) {
      page = doc.addPage([612, 792]);
      y = 740;
    }
  }
  return new Uint8Array(await doc.save());
}

async function main() {
  const pdf = await makePdf(lesson);
  const extracted = await extractPdf(pdf);
  const joined = extracted.pages.join("\n");
  assert(extracted.pageCount >= 1, "PDF should have a page count");
  assert(/switch/i.test(joined), "Extracted text should include switch");
  const facts = extractFacts(extracted.pages);
  console.log("facts", facts.map((fact) => fact.term));
  assert(facts.length >= 6, `Expected at least 6 facts, got ${facts.length}`);

  const counts = allocateCounts(8, { easy: 40, moderate: 40, hard: 20 });
  const first = generateGroundedQuestions({
    lessonText: joined,
    pages: extracted.pages,
    count: 8,
    types: ["multiple_choice", "modified_tf", "identification"],
    difficultyCounts: counts,
    avoidTexts: [],
  });
  console.log("generated", first.questions.length, first.note);
  for (const question of first.questions) {
    console.log(`\n[${question.difficulty} ${question.questionType}] ${question.questionText}`);
    console.log("answer:", question.correctAnswer);
  }
  assert(first.questions.length >= 5, "Expected a usable quiz");
  for (const question of first.questions) {
    const reasons = validateDraft(question, joined, [], false);
    assert(reasons.length === 0, `${question.questionText}\n${reasons.join("; ")}`);
    if (question.questionType === "multiple_choice") {
      assert(question.choices.filter((choice) => choice.isCorrect).length === 1, "MC must have one answer");
    }
    if (question.questionType === "identification") {
      for (const answer of [question.correctAnswer, ...question.acceptableAnswers]) {
        if (norm(answer).length >= 3) assert(!norm(question.questionText).includes(norm(answer)), "ID leaked the answer");
      }
    }
    if (question.questionType === "modified_tf" && question.statementIsTrue === false) {
      assert(!joined.toLowerCase().includes(question.questionText.toLowerCase()), "False statement was copied from the lesson");
    }
  }
  const types = new Set(first.questions.map((question) => question.questionType));
  assert(types.size >= 2, "Expected more than one question type");

  const second = generateGroundedQuestions({
    lessonText: joined,
    pages: extracted.pages,
    count: 4,
    types: ["multiple_choice", "identification", "modified_tf"],
    difficultyCounts: allocateCounts(4, { easy: 50, moderate: 50, hard: 0 }),
    avoidTexts: first.questions.map((question) => question.questionText),
  });
  for (const question of second.questions) {
    assert(!first.questions.some((prior) => norm(prior.questionText) === norm(question.questionText)), "New quiz repeated a question");
  }

  const mc = first.questions.find((question) => question.questionType === "multiple_choice");
  assert(mc, "Need a multiple choice question to score");
  const correct = mc!.choices.find((choice) => choice.isCorrect)!;
  const graded = evaluateAnswer(
    {
      id: "q",
      question_type: "multiple_choice",
      correct_answer: mc!.correctAnswer,
      statement_is_true: null,
      incorrect_phrase: null,
      correct_replacement: null,
      acceptable_answers: "[]",
      choices: mc!.choices.map((choice, index) => ({ id: `c${index}`, choice_text: choice.text, is_correct: choice.isCorrect ? 1 : 0 })),
    },
    { questionId: "q", selectedChoiceId: `c${mc!.choices.findIndex((choice) => choice.text === correct.text)}` },
  );
  assert(graded.isCorrect, "Correct choice should score");
  const missed = evaluateAnswer(
    {
      id: "q",
      question_type: "multiple_choice",
      correct_answer: mc!.correctAnswer,
      statement_is_true: null,
      incorrect_phrase: null,
      correct_replacement: null,
      acceptable_answers: "[]",
      choices: mc!.choices.map((choice, index) => ({ id: `c${index}`, choice_text: choice.text, is_correct: choice.isCorrect ? 1 : 0 })),
    },
    { questionId: "q" },
  );
  assert(!missed.isCorrect && missed.stored.kind === "unanswered", "Blank answer should be unanswered");
  console.log("generator test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

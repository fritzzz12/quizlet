import { PDFDocument, StandardFonts } from "pdf-lib";

const base = process.env.BASE_URL || "http://127.0.0.1:3456";

const lesson = `Computer Networks

A computer network is a collection of connected devices that share data and resources.

A switch connects multiple computers within a local network. It forwards frames based on MAC addresses.

A router forwards packets between different networks based on IP addresses. It uses routing tables to choose a path.

A modem converts digital signals from a computer into analog signals for transmission over telephone or cable lines.

A firewall monitors and controls incoming and outgoing network traffic based on security rules.

An IP address is a numerical label assigned to each device on a network. DNS, or Domain Name System, translates human-readable domain names into IP addresses.

TCP is a connection-oriented protocol that guarantees reliable ordered delivery of data. UDP is a connectionless protocol that does not guarantee delivery.

A local area network, or LAN, covers a small geographic area such as a home or office. A wide area network, or WAN, spans a large geographic area and often connects multiple local networks.`;

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function pdfFrom(text: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  let page = doc.addPage([612, 792]);
  let y = 740;
  for (const chunk of text.split(/\n\n+/)) {
    const words = chunk.replace(/\n/g, " ").split(/\s+/).filter(Boolean);
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
  }
  return new Uint8Array(await doc.save());
}

class Session {
  cookie = "";

  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("cookie", this.cookie);
    const response = await fetch(`${base}${path}`, { ...init, headers });
    const setCookie = response.headers.getSetCookie?.() || [];
    if (setCookie.length) this.cookie = setCookie.map((item) => item.split(";")[0]).join("; ");
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return { status: response.status, data };
  }
}

function leakScan(value: unknown, path = "root"): string[] {
  if (!value || typeof value !== "object") return [];
  const hits: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (["correctAnswer", "isCorrect", "explanation", "acceptableAnswers", "correct_answer", "sourceExcerpt"].includes(key)) hits.push(`${path}.${key}`);
    hits.push(...leakScan(child, `${path}.${key}`));
  }
  return hits;
}

async function main() {
  const stamp = Date.now();
  const student = new Session();
  const other = new Session();
  const register = await student.request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Ada Lovelace", email: `ada${stamp}@folio.test`, password: "lesson-quiz-1" }),
  });
  assert(register.status === 200, `register failed ${register.status} ${JSON.stringify(register.data)}`);

  const pdf = await pdfFrom(lesson);
  const form = new FormData();
  form.set("file", new File([pdf], "computer-networks.pdf", { type: "application/pdf" }));
  form.set("title", "Computer Networks");
  const uploaded = await student.request("/api/lessons/upload", { method: "POST", body: form });
  assert(uploaded.status === 200, `upload failed ${JSON.stringify(uploaded.data)}`);
  assert(uploaded.data.contentStatus === "readable", `content not readable: ${uploaded.data.contentStatus} ${uploaded.data.failureReason}`);
  assert(uploaded.data.pageCount >= 1, "missing page count");
  assert(uploaded.data.summary?.length > 20, "missing summary");
  const lessonId = uploaded.data.lessonId as string;

  const bad = new FormData();
  bad.set("file", new File([new TextEncoder().encode("not a pdf")], "notes.txt", { type: "text/plain" }));
  const rejected = await student.request("/api/lessons/upload", { method: "POST", body: bad });
  assert(rejected.status === 400, "non-pdf should be rejected");

  const emptyDoc = await PDFDocument.create();
  emptyDoc.addPage();
  const emptyForm = new FormData();
  emptyForm.set("file", new File([new Uint8Array(await emptyDoc.save())], "blank.pdf", { type: "application/pdf" }));
  const blank = await student.request("/api/lessons/upload", { method: "POST", body: emptyForm });
  assert(blank.status === 200, "blank pdf should be stored with a failure");
  assert(blank.data.contentStatus !== "readable", "blank pdf should not be quiz-ready");

  const generated = await student.request("/api/quizzes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lessonId,
      mode: "custom",
      difficulty: "moderate",
      types: ["multiple_choice", "modified_tf", "identification"],
      count: 6,
    }),
  });
  assert(generated.status === 200, `generate failed ${JSON.stringify(generated.data)}`);
  const quizId = generated.data.quizId as string;

  const quiz = await student.request(`/api/quizzes/${quizId}`);
  assert(quiz.status === 200, "quiz fetch failed");
  const leaks = leakScan(quiz.data);
  assert(leaks.length === 0, `quiz leaked answers: ${leaks.join(", ")}`);
  const questions = quiz.data.questions as { id: string; questionType: string; choices: { id: string; text: string }[]; phraseOptions: string[] }[];
  assert(questions.length >= 3, "too few questions");

  const firstTry = await student.request(`/api/quizzes/${quizId}/attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers: [], timeTakenSeconds: 12, timerEnabled: true }),
  });
  assert(firstTry.status === 200, "blank submit failed");
  const review = await student.request(`/api/attempts/${firstTry.data.attemptId}`);
  assert(review.status === 200, "review failed");
  assert(review.data.attempt.percentage === 0, "blank quiz should score 0");
  assert(review.data.attempt.unansweredCount === questions.length, "blanks should be unanswered");
  assert(review.data.attempt.questions[0].explanation, "review missing explanation");
  assert(review.data.attempt.questions[0].sourceReference, "review missing source");

  const answers = review.data.attempt.questions.map((question: { id: string; questionType: string; correctAnswer: string; choices: { id: string; text: string }[] }) => {
    if (question.questionType === "multiple_choice") {
      const choice = question.choices.find((item) => item.text === question.correctAnswer);
      assert(choice, "could not match the correct choice");
      return { questionId: question.id, selectedChoiceId: choice!.id };
    }
    if (question.questionType === "identification") return { questionId: question.id, identification: question.correctAnswer };
    if (question.correctAnswer === "True") return { questionId: question.id, verdict: "true" };
    const match = question.correctAnswer.match(/Replace “(.+)” with “(.+)”/);
    assert(match, `could not parse correction: ${question.correctAnswer}`);
    return { questionId: question.id, verdict: "false", incorrectPhrase: match![1], correction: match![2] };
  });
  const second = await student.request(`/api/quizzes/${quizId}/attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers, timeTakenSeconds: 40, timerEnabled: false }),
  });
  const perfect = await student.request(`/api/attempts/${second.data.attemptId}`);
  assert(perfect.data.attempt.percentage === 100, `expected 100, got ${perfect.data.attempt.percentage}`);
  assert(perfect.data.attempt.byType && perfect.data.attempt.byDifficulty, "missing breakdowns");

  const again = await student.request("/api/quizzes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonId, mode: "quick", count: 5 }),
  });
  assert(again.status === 200, `second quiz failed ${JSON.stringify(again.data)}`);
  const secondQuiz = await student.request(`/api/quizzes/${again.data.quizId}`);
  const firstTexts = new Set(questions.map((question) => question.questionText || ""));
  const overlap = (secondQuiz.data.questions as { questionText: string }[]).filter((question) => firstTexts.has(question.questionText));
  assert(overlap.length === 0, "second quiz repeated a question");

  const assistant = await student.request("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonId, question: "What are the most important concepts?" }),
  });
  assert(assistant.status === 200, "assistant failed");
  assert(/switch|router|lesson/i.test(assistant.data.reply), "assistant did not use the lesson");

  await other.request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Grace Hopper", email: `grace${stamp}@folio.test`, password: "lesson-quiz-1" }),
  });
  const stolen = await other.request(`/api/lessons/${lessonId}`);
  assert(stolen.status === 404, "another user could open the lesson");
  const stolenQuiz = await other.request(`/api/quizzes/${quizId}`);
  assert(stolenQuiz.status === 404, "another user could open the quiz");

  const dashboard = await student.request("/api/dashboard");
  assert(dashboard.data.performance.completed >= 2, "dashboard missing attempts");
  assert(dashboard.data.lessons.length >= 1, "dashboard missing lessons");

  const removed = await student.request(`/api/lessons/${lessonId}`, { method: "DELETE" });
  assert(removed.status === 200, "delete failed");
  const gone = await student.request(`/api/lessons/${lessonId}`);
  assert(gone.status === 404, "deleted lesson still visible");
  console.log("workflow test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { randomUUID } from "crypto";
import path from "path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_STORED_TEXT, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { jsonError, withUser } from "@/lib/http";
import { extractPdf, inferTitle, inspectLesson, isPdfBuffer } from "@/lib/pdf";
import { deleteLessonPdf, lessonIdFromPathname, readLessonPdf, saveLessonPdf } from "@/lib/storage";
import { insertLesson } from "@/lib/store";
import { joinPages } from "@/lib/text";

export const runtime = "nodejs";
export const maxDuration = 60;

const blobSchema = z.object({
  pathname: z.string().regex(/^lessons\/[0-9a-f-]{36}\.pdf$/i),
  filename: z.string().trim().min(1).max(180),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  title: z.string().trim().max(120).optional(),
});

function safeName(name: string) {
  return path.basename(name).replace(/[^\w.\- ()]/g, "_").slice(0, 180);
}

function capPages(pages: string[]) {
  const kept: string[] = [];
  let size = 0;
  for (const page of pages) {
    if (size + page.length > MAX_STORED_TEXT) break;
    kept.push(page);
    size += page.length;
  }
  if (kept.length) return kept;
  return [pages[0]?.slice(0, MAX_STORED_TEXT) || ""];
}

async function storeLesson(input: {
  userId: string;
  lessonId: string;
  filename: string;
  titleInput: string;
  bytes: Uint8Array;
  filePath: string;
}) {
  const fileSize = input.bytes.byteLength;
  let pages: string[] = [];
  let pageCount = 0;
  let failure: string | null = null;
  try {
    const extracted = await extractPdf(input.bytes);
    pages = capPages(extracted.pages);
    pageCount = extracted.pageCount || pages.length;
  } catch {
    failure = "The PDF could not be read. It may be damaged or protected.";
  }

  const inspection = failure
    ? { contentStatus: "unreadable" as const, failureReason: failure, wordCount: 0, conceptCount: 0, maxQuestions: 0, summary: "" }
    : inspectLesson(pages);
  const ready = inspection.contentStatus === "readable";
  const title = (input.titleInput || inferTitle(input.filename, pages)).slice(0, 120);
  await insertLesson({
    id: input.lessonId,
    user_id: input.userId,
    title,
    filename: input.filename,
    file_path: input.filePath,
    file_size: fileSize,
    page_count: pageCount,
    extracted_text: joinPages(pages),
    summary: inspection.summary,
    processing_status: ready ? "ready" : "failed",
    content_status: inspection.contentStatus,
    failure_reason: inspection.failureReason,
    word_count: inspection.wordCount,
    concept_count: inspection.conceptCount,
    max_questions: inspection.maxQuestions,
  });

  return NextResponse.json({
    lessonId: input.lessonId,
    title,
    filename: input.filename,
    fileSize,
    pageCount,
    processingStatus: ready ? "ready" : "failed",
    contentStatus: inspection.contentStatus,
    failureReason: inspection.failureReason,
    summary: inspection.summary,
    wordCount: inspection.wordCount,
    conceptCount: inspection.conceptCount,
    maxQuestions: inspection.maxQuestions,
    createdAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      let body: z.infer<typeof blobSchema>;
      try {
        body = blobSchema.parse(await request.json());
      } catch {
        return jsonError("The uploaded PDF could not be read.", 400);
      }
      const filePath = `blob:${body.pathname}`;
      const bytes = await readLessonPdf(filePath);
      if (bytes.byteLength <= 0 || bytes.byteLength > MAX_UPLOAD_BYTES || !isPdfBuffer(bytes)) {
        await deleteLessonPdf(filePath);
        return jsonError("That file is not a valid PDF.", 400);
      }
      const filename = safeName(body.filename);
      if (!filename.toLowerCase().endsWith(".pdf")) {
        await deleteLessonPdf(filePath);
        return jsonError("Only PDF lessons can be uploaded.", 400);
      }
      return storeLesson({
        userId: user.id,
        lessonId: lessonIdFromPathname(body.pathname),
        filename,
        titleInput: body.title || "",
        bytes,
        filePath,
      });
    }

    const form = await request.formData();
    const file = form.get("file");
    const titleInput = String(form.get("title") || "").trim();
    if (!(file instanceof File)) return jsonError("Choose a PDF to upload.", 400);
    if (file.size <= 0) return jsonError("That file is empty.", 400);
    if (file.size > MAX_UPLOAD_BYTES) return jsonError("PDFs must be 15 MB or smaller.", 400);
    const filename = safeName(file.name || "lesson.pdf");
    if (!filename.toLowerCase().endsWith(".pdf")) return jsonError("Only PDF lessons can be uploaded.", 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isPdfBuffer(bytes)) return jsonError("That file is not a valid PDF.", 400);

    const lessonId = randomUUID();
    const filePath = await saveLessonPdf(user.id, lessonId, bytes);
    try {
      return await storeLesson({ userId: user.id, lessonId, filename, titleInput, bytes, filePath });
    } catch (error) {
      await deleteLessonPdf(filePath);
      throw error;
    }
  });
}

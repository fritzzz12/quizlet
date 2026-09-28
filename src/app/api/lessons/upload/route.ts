import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import { NextResponse } from "next/server";
import { MAX_STORED_TEXT, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { lessonFileLocation } from "@/lib/files";
import { jsonError, withUser } from "@/lib/http";
import { extractPdf, inferTitle, inspectLesson, isPdfBuffer } from "@/lib/pdf";
import { insertLesson } from "@/lib/store";
import { joinPages } from "@/lib/text";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  return withUser(async (user) => {
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
    const location = lessonFileLocation(user.id, lessonId);
    await mkdir(location.root, { recursive: true });
    await writeFile(location.file, bytes);

    let pages: string[] = [];
    let pageCount = 0;
    let failure: string | null = null;
    try {
      const extracted = await extractPdf(bytes);
      pages = capPages(extracted.pages);
      pageCount = extracted.pageCount || pages.length;
    } catch {
      failure = "The PDF could not be read. It may be damaged or protected.";
    }

    const inspection = failure
      ? { contentStatus: "unreadable" as const, failureReason: failure, wordCount: 0, conceptCount: 0, maxQuestions: 0, summary: "" }
      : inspectLesson(pages);
    const ready = inspection.contentStatus === "readable";
    insertLesson({
      id: lessonId,
      user_id: user.id,
      title: (titleInput || inferTitle(filename, pages)).slice(0, 120),
      filename,
      file_path: location.file,
      file_size: file.size,
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
      lessonId,
      title: titleInput || inferTitle(filename, pages),
      filename,
      fileSize: file.size,
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
  });
}

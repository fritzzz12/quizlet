import { NextResponse } from "next/server";
import { jsonError, withUser } from "@/lib/http";
import { readLessonPdf } from "@/lib/storage";
import { getLesson } from "@/lib/store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withUser(async (user) => {
    const lesson = await getLesson(id, user.id);
    if (!lesson) return jsonError("Lesson not found.", 404);
    const bytes = await readLessonPdf(lesson.file_path);
    const filename = lesson.filename.replace(/[^\w.\- ()]/g, "_");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  });
}

import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { blobEnabled, ConfigError } from "@/lib/config";
import { lessonFileLocation } from "@/lib/files";

const BLOB_PATH = /^lessons\/[0-9a-f-]{36}\.pdf$/i;

export function directUploadsEnabled() {
  return blobEnabled();
}

export function assertFileStorage() {
  if (process.env.VERCEL && !blobEnabled()) {
    throw new ConfigError("Add a Blob store in the Vercel project. Storage creates BLOB_READ_WRITE_TOKEN, which Folio uses for lesson PDFs.");
  }
}

export function blobPath(pathname: string) {
  if (!BLOB_PATH.test(pathname)) throw new ConfigError("That upload path is not valid.");
  return `blob:${pathname}`;
}

export function lessonIdFromPathname(pathname: string) {
  if (!BLOB_PATH.test(pathname)) throw new ConfigError("That upload path is not valid.");
  return pathname.slice("lessons/".length, -".pdf".length);
}

export async function saveLessonPdf(userId: string, lessonId: string, bytes: Uint8Array) {
  assertFileStorage();
  if (blobEnabled()) {
    const { put } = await import("@vercel/blob");
    const pathname = `lessons/${lessonId}.pdf`;
    await put(pathname, Buffer.from(bytes), {
      access: "private",
      contentType: "application/pdf",
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return `blob:${pathname}`;
  }
  const location = lessonFileLocation(userId, lessonId);
  await mkdir(location.root, { recursive: true });
  await writeFile(location.file, bytes);
  return location.file;
}

export async function readLessonPdf(filePath: string) {
  if (filePath.startsWith("blob:")) {
    const { get } = await import("@vercel/blob");
    const result = await get(filePath.slice("blob:".length), { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) throw new ConfigError("The PDF file is missing.");
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  }
  return new Uint8Array(await readFile(filePath));
}

export async function deleteLessonPdf(filePath: string) {
  if (filePath.startsWith("blob:")) {
    const { del } = await import("@vercel/blob");
    await del(filePath.slice("blob:".length)).catch(() => undefined);
    return;
  }
  await unlink(filePath).catch(() => undefined);
}

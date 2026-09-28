import path from "path";

export function lessonFileLocation(userId: string, lessonId: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(userId) || !/^[a-zA-Z0-9-]+$/.test(lessonId)) {
    throw new Error("Invalid storage path.");
  }
  const root = path.resolve(process.cwd(), "data", "uploads", userId);
  const file = path.resolve(root, `${lessonId}.pdf`);
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Invalid storage path.");
  return { root, file };
}

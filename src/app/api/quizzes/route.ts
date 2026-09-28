import { NextResponse } from "next/server";
import { withUser } from "@/lib/http";
import { listQuizzes } from "@/lib/store";

export async function GET() {
  return withUser(async (user) => NextResponse.json({ quizzes: listQuizzes(user.id) }));
}

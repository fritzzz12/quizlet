import { NextResponse } from "next/server";
import { withUser } from "@/lib/http";
import { listLessons } from "@/lib/store";

export async function GET() {
  return withUser(async (user) => NextResponse.json({ lessons: listLessons(user.id) }));
}

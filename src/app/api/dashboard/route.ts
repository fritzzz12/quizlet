import { NextResponse } from "next/server";
import { withUser } from "@/lib/http";
import { dashboardFor } from "@/lib/store";

export async function GET() {
  return withUser(async (user) => NextResponse.json(await dashboardFor(user.id)));
}

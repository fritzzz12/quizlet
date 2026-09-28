import { NextResponse } from "next/server";
import { directUploadsEnabled } from "@/lib/storage";

export function GET() {
  return NextResponse.json({ directUpload: directUploadsEnabled() });
}

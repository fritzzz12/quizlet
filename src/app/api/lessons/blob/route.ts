import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { blobEnabled } from "@/lib/config";
import { jsonError, withUser } from "@/lib/http";

export const runtime = "nodejs";

const PATHNAME = /^lessons\/[0-9a-f-]{36}\.pdf$/i;

export async function POST(request: Request) {
  return withUser(async () => {
    if (!blobEnabled()) return jsonError("PDF uploads are stored on this computer.", 400);
    const body = (await request.json()) as HandleUploadBody;
    try {
      const result = await handleUpload({
        body,
        request,
        onBeforeGenerateToken: async (pathname) => {
          if (!PATHNAME.test(pathname)) throw new Error("Choose a PDF to upload.");
          return {
            allowedContentTypes: ["application/pdf"],
            maximumSizeInBytes: MAX_UPLOAD_BYTES,
            addRandomSuffix: false,
            allowOverwrite: false,
          };
        },
      });
      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The PDF could not be uploaded.";
      return jsonError(message, 400);
    }
  });
}

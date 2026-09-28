import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPassword, hashPassword, publicUser } from "@/lib/auth";
import { jsonError, withUser } from "@/lib/http";
import { aiConfigured } from "@/lib/llm";
import { updatePasswordHash, updateProfile, updateSettings } from "@/lib/store";
import { getUserById } from "@/lib/auth";

const profileSchema = z.object({ name: z.string().trim().min(2).max(80) });
const passwordSchema = z.object({
  currentPassword: z.string().min(8).max(72),
  nextPassword: z.string().min(8).max(72),
});
const settingsSchema = z.object({
  allowExternalKnowledge: z.boolean(),
  defaultTimer: z.boolean(),
});

export async function PATCH(request: Request) {
  return withUser(async (user) => {
    const body = await request.json();
    if ("name" in body) {
      try {
        const parsed = profileSchema.parse(body);
        updateProfile(user.id, parsed.name);
      } catch {
        return jsonError("Enter a name between 2 and 80 characters.", 400);
      }
    }
    if ("nextPassword" in body) {
      try {
        const parsed = passwordSchema.parse(body);
        if (!(await checkPassword(parsed.currentPassword, user.password_hash))) return jsonError("Current password is incorrect.", 400);
        updatePasswordHash(user.id, await hashPassword(parsed.nextPassword));
      } catch {
        return jsonError("Passwords must be at least 8 characters.", 400);
      }
    }
    if ("allowExternalKnowledge" in body || "defaultTimer" in body) {
      try {
        const parsed = settingsSchema.parse({
          allowExternalKnowledge: "allowExternalKnowledge" in body ? body.allowExternalKnowledge : user.allow_external_knowledge === 1,
          defaultTimer: "defaultTimer" in body ? body.defaultTimer : user.default_timer === 1,
        });
        updateSettings(user.id, parsed);
      } catch {
        return jsonError("Those settings could not be saved.", 400);
      }
    }
    const fresh = getUserById(user.id);
    if (!fresh) return jsonError("Account not found.", 404);
    return NextResponse.json({ user: { ...publicUser(fresh), aiConfigured: aiConfigured() } });
  });
}

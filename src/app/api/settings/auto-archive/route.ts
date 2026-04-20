import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  getAutoArchivePreferences,
  setAutoArchivePreferences,
  type AutoArchiveDays,
} from "@/lib/auto-archive";
import { authedUserId } from "@/lib/auth-types";

export async function GET() {
  const { userId: rawUserId } = await auth();
  if (!rawUserId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = authedUserId(rawUserId);

  const prefs = await getAutoArchivePreferences(userId);
  return Response.json(
    { preferences: prefs },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

const daysSchema: z.ZodType<AutoArchiveDays> = z.union([
  z.null(),
  z.literal(14),
  z.literal(30),
  z.literal(90),
  z.literal(180),
]);

const patchSchema = z.object({
  unreadAfterDays: daysSchema,
  readAfterDays: daysSchema,
});

export async function PATCH(req: Request) {
  // Origin check + auth are enforced by `src/proxy.ts`.
  const { userId: rawUserId } = await auth();
  if (!rawUserId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = authedUserId(rawUserId);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error:
          "Expected { unreadAfterDays: null|14|30|90|180, readAfterDays: null|14|30|90|180 }",
      },
      { status: 400 },
    );
  }

  const prefs = await setAutoArchivePreferences(userId, parsed.data);
  return Response.json({ preferences: prefs });
}

import { auth, clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { getDigestPreferences, setDigestPreferences } from "@/lib/digest";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const prefs = await getDigestPreferences(userId);
  return Response.json({ preferences: prefs });
}

const patchSchema = z.object({
  enabled: z.boolean(),
  email: z.string().email().optional(),
});

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Expected { enabled: boolean, email?: string }" },
      { status: 400 },
    );
  }

  // If no email provided, fall back to the user's primary Clerk email
  let email = parsed.data.email;
  if (!email) {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    const primary = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId,
    );
    email = primary?.emailAddress;
    if (!email) {
      return Response.json(
        { error: "No email address found on your account" },
        { status: 400 },
      );
    }
  }

  const prefs = await setDigestPreferences(userId, {
    enabled: parsed.data.enabled,
    email,
  });
  return Response.json({ preferences: prefs });
}

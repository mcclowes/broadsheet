import {
  verifyUnsubscribeToken,
  setDigestPreferences,
  getDigestPreferences,
} from "@/lib/digest";

/**
 * One-click unsubscribe endpoint for digest emails.
 * Accepts both GET (link click) and POST (List-Unsubscribe-Post).
 */
async function handleUnsubscribe(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const userId = url.searchParams.get("uid");
  const token = url.searchParams.get("token");

  if (!userId || !token) {
    return new Response("Missing parameters", { status: 400 });
  }

  if (!verifyUnsubscribeToken(userId, token)) {
    return new Response("Invalid token", { status: 403 });
  }

  const prefs = await getDigestPreferences(userId);
  if (prefs.enabled) {
    await setDigestPreferences(userId, {
      enabled: false,
      email: prefs.email,
    });
  }

  return new Response(
    "<html><body><h1>Unsubscribed</h1><p>You have been unsubscribed from the Broadsheet daily digest.</p></body></html>",
    { headers: { "Content-Type": "text/html" } },
  );
}

export async function GET(req: Request) {
  return handleUnsubscribe(req);
}

export async function POST(req: Request) {
  return handleUnsubscribe(req);
}

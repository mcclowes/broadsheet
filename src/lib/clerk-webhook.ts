export interface ClerkWebhookDeps {
  verify: (payload: string, headers: Headers) => unknown;
  deleteUser: (userId: string) => Promise<void>;
}

interface ClerkEvent {
  type: string;
  data: { id?: string };
}

function isClerkEvent(v: unknown): v is ClerkEvent {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { type?: unknown }).type === "string" &&
    typeof (v as { data?: unknown }).data === "object"
  );
}

export async function handleClerkWebhook(
  req: Request,
  deps: ClerkWebhookDeps,
): Promise<Response> {
  const payload = await req.text();
  let event: unknown;
  try {
    event = deps.verify(payload, req.headers);
  } catch (err) {
    console.warn("[webhooks/clerk] signature verification failed", {
      message: (err as Error).message,
    });
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!isClerkEvent(event)) {
    return Response.json({ error: "Malformed event" }, { status: 400 });
  }

  if (event.type === "user.deleted") {
    const id = event.data.id;
    if (!id) {
      return Response.json({ error: "Missing user id" }, { status: 400 });
    }
    await deps.deleteUser(id);
    console.info("[webhooks/clerk] deleted user data", { userId: id });
  }

  return Response.json({ ok: true });
}

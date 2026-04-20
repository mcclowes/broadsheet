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

  switch (event.type) {
    case "user.deleted": {
      const id = event.data.id;
      if (!id) {
        return Response.json({ error: "Missing user id" }, { status: 400 });
      }
      try {
        await deps.deleteUser(id);
      } catch (err) {
        // Partial failure or transient storage error. Returning 5xx so
        // Svix retries — deletion is idempotent on success paths, and
        // we'd rather re-run than silently skip GDPR-relevant cleanup.
        console.error("[webhooks/clerk] user deletion failed", {
          userId: id,
          err,
        });
        return Response.json({ error: "Deletion failed" }, { status: 500 });
      }
      console.info("[webhooks/clerk] deleted user data", { userId: id });
      break;
    }
    default: {
      // We intentionally 200 unhandled event types so Clerk doesn't retry
      // forever, but we log them so we notice if Clerk starts sending
      // something we ought to handle.
      console.info("[webhooks/clerk] unhandled event type", {
        type: event.type,
      });
      break;
    }
  }

  return Response.json({ ok: true });
}

import { Webhook } from "svix";
import { authedUserId } from "@/lib/auth-types";
import { handleClerkWebhook } from "@/lib/clerk-webhook";
import { deleteAllUserData } from "@/lib/user-deletion";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    console.error("[webhooks/clerk] CLERK_WEBHOOK_SIGNING_SECRET not set");
    return Response.json({ error: "Misconfigured" }, { status: 500 });
  }
  const wh = new Webhook(secret);
  return handleClerkWebhook(req, {
    verify: (payload, headers) => {
      const hdrs: Record<string, string> = {};
      headers.forEach((v, k) => {
        hdrs[k] = v;
      });
      return wh.verify(payload, hdrs);
    },
    deleteUser: (id) => deleteAllUserData(authedUserId(id)),
  });
}

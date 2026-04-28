import { Resend } from "resend";
import { listArticles } from "@/lib/articles";
import { authedUserId } from "@/lib/auth-types";
import { verifyCronBearer } from "@/lib/cron-auth";
import { listDigestSubscribers, markDigestSent } from "@/lib/digest";
import {
  buildDigestHtml,
  buildDigestSubject,
  unsubscribeUrl,
} from "@/lib/digest-email";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DIGEST_FROM =
  process.env.DIGEST_FROM_EMAIL ??
  "Broadsheet <digest@broadsheet.marginalutility.dev>";
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://broadsheet.marginalutility.dev";

export async function POST(req: Request) {
  // Verify the request is from Vercel Cron or an admin with the secret.
  if (!verifyCronBearer(req.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!RESEND_API_KEY) {
    console.error("[digest/send] RESEND_API_KEY is not configured");
    return Response.json(
      { error: "Email service not configured" },
      { status: 500 },
    );
  }

  const resend = new Resend(RESEND_API_KEY);
  const subscribers = await listDigestSubscribers();

  if (subscribers.length === 0) {
    return Response.json({ sent: 0, message: "No subscribers" });
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const subject = buildDigestSubject(now);
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Idempotency: skip subscribers who already received today's digest
  const eligible = subscribers.filter((sub) => {
    if (sub.lastDigestSentAt?.startsWith(todayStr)) {
      skipped++;
      return false;
    }
    return true;
  });

  // Process in batches of 5 for concurrency without overwhelming Resend
  const BATCH_SIZE = 5;
  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (sub) => {
        const articles = await listArticles(authedUserId(sub.userId), {
          view: "inbox",
          state: "unread",
        });

        if (articles.length === 0) {
          skipped++;
          return;
        }

        const html = buildDigestHtml({
          articles,
          date: now,
          baseUrl: BASE_URL,
          userId: sub.userId,
        });

        const unsub = unsubscribeUrl(BASE_URL, sub.userId);
        const result = await resend.emails.send({
          from: DIGEST_FROM,
          to: sub.email,
          subject,
          html,
          headers: {
            "List-Unsubscribe": `<${unsub}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });

        if (result.error) {
          console.error("[digest/send] resend error", {
            userId: sub.userId,
            error: result.error,
          });
          throw new Error("Resend error");
        }

        await markDigestSent(sub.userId);
        sent++;
      }),
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === "rejected") {
        errors.push(batch[j].userId);
      }
    }
  }

  return Response.json({
    sent,
    skipped,
    errors: errors.length,
  });
}

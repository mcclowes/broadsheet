import { Resend } from "resend";
import { listArticles } from "@/lib/articles";
import { listDigestSubscribers } from "@/lib/digest";
import { buildDigestHtml, buildDigestSubject } from "@/lib/digest-email";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const DIGEST_FROM =
  process.env.DIGEST_FROM_EMAIL ?? "Broadsheet <digest@broadsheet.app>";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://broadsheet.app";

export async function POST(req: Request) {
  // Verify the request is from Vercel Cron or an admin with the secret
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
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
  const subject = buildDigestSubject(now);
  let sent = 0;
  const errors: string[] = [];

  for (const sub of subscribers) {
    try {
      const articles = await listArticles(sub.userId, {
        view: "inbox",
        state: "unread",
      });

      if (articles.length === 0) continue;

      const html = buildDigestHtml({
        articles,
        date: now,
        baseUrl: BASE_URL,
      });

      const result = await resend.emails.send({
        from: DIGEST_FROM,
        to: sub.email,
        subject,
        html,
      });

      if (result.error) {
        console.error("[digest/send] resend error", {
          userId: sub.userId,
          error: result.error,
        });
        errors.push(sub.userId);
      } else {
        sent++;
      }
    } catch (err) {
      console.error("[digest/send] failed for subscriber", {
        userId: sub.userId,
        error: err,
      });
      errors.push(sub.userId);
    }
  }

  return Response.json({
    sent,
    skipped: subscribers.length - sent - errors.length,
    errors: errors.length,
  });
}

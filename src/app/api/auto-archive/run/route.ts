import { authedUserId } from "@/lib/auth-types";
import {
  listAutoArchiveSubscribers,
  markAutoArchiveRun,
  runAutoArchiveForUser,
} from "@/lib/auto-archive";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: Request) {
  // Verify the request is from Vercel Cron or an admin with the secret
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscribers = await listAutoArchiveSubscribers();
  if (subscribers.length === 0) {
    return Response.json({ users: 0, archived: 0 });
  }

  const now = new Date();
  let totalArchived = 0;
  const errors: string[] = [];

  // Process in batches of 5 for gentle concurrency
  const BATCH_SIZE = 5;
  for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
    const batch = subscribers.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (sub) => {
        const archived = await runAutoArchiveForUser(
          authedUserId(sub.userId),
          {
            unreadAfterDays: sub.unreadAfterDays,
            readAfterDays: sub.readAfterDays,
          },
          now,
        );
        totalArchived += archived;
        await markAutoArchiveRun(sub.userId);
      }),
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === "rejected") {
        const reason = (results[j] as PromiseRejectedResult).reason;
        console.error("[auto-archive/run] user failed", {
          userId: batch[j].userId,
          reason,
        });
        errors.push(batch[j].userId);
      }
    }
  }

  return Response.json({
    users: subscribers.length,
    archived: totalArchived,
    errors: errors.length,
  });
}

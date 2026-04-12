import { auth } from "@clerk/nextjs/server";
import { searchArticles } from "@/lib/search";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit")) || 20),
    100,
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  const results = await searchArticles(userId, q, { limit, offset });
  return Response.json({ results });
}

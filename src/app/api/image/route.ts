import { auth } from "@clerk/nextjs/server";
import { authedUserId } from "@/lib/auth-types";
import { fetchPublicImage, IngestError } from "@/lib/ingest";
import { imageProxyLimiter } from "@/lib/rate-limit";

// One day at the edge. Publisher hero images are effectively immutable — URLs
// change when the image changes because CDNs cache-bust via the path — so this
// is safe even without a stale-while-revalidate window.
const EDGE_CACHE_HEADER = "public, s-maxage=86400, max-age=0, must-revalidate";

export async function GET(req: Request) {
  const { userId: rawUserId } = await auth();
  if (!rawUserId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = authedUserId(rawUserId);

  const limit = imageProxyLimiter.consume(userId);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((limit.retryAfterMs ?? 1000) / 1000)),
        },
      },
    );
  }

  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return Response.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    const { bytes, contentType } = await fetchPublicImage(url);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": EDGE_CACHE_HEADER,
        // Don't leak the upstream URL to anywhere an image embed might go.
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (err) {
    if (err instanceof IngestError) {
      console.warn("[api/image] fetch failed", { url, message: err.message });
      return Response.json({ error: err.publicMessage }, { status: 422 });
    }
    console.error("[api/image] unexpected error", {
      url,
      errorName: err instanceof Error ? err.constructor.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

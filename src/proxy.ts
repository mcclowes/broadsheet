import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedPage = createRouteMatcher([
  "/library(.*)",
  "/read(.*)",
  "/sources(.*)",
  "/settings(.*)",
  "/import(.*)",
]);

// Note: `/api/digest/send` (Vercel Cron) and `/api/digest/unsubscribe`
// (one-click email links) authenticate themselves — the first with a
// `Bearer ${CRON_SECRET}` header, the second with an HMAC'd token — so
// they must NOT be gated by Clerk. Only `/api/digest/preferences*` is a
// user-session endpoint.
const isProtectedApi = createRouteMatcher([
  "/api/articles(.*)",
  "/api/sources(.*)",
  "/api/digest/preferences(.*)",
  "/api/import(.*)",
]);

export default clerkMiddleware(
  async (auth, req) => {
    if (isProtectedApi(req)) {
      const { userId } = await auth();
      if (!userId) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      return;
    }
    if (isProtectedPage(req)) {
      await auth.protect();
    }
  },
  {
    frontendApiProxy: { enabled: true },
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedPage = createRouteMatcher([
  "/library(.*)",
  "/read(.*)",
  "/sources(.*)",
  "/settings(.*)",
  "/import(.*)",
]);

const isProtectedApi = createRouteMatcher([
  "/api/articles(.*)",
  "/api/sources(.*)",
  "/api/digest(.*)",
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

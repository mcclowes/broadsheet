import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isPreviewMode } from "./lib/preview-mode";

const isProtected = createRouteMatcher([
  "/library(.*)",
  "/read(.*)",
  "/sources(.*)",
  "/api/articles(.*)",
  "/api/sources(.*)",
]);

// In preview mode Clerk isn't provisioned — every request passes through
// and `getRequestUserId()` returns the demo user instead.
function previewMiddleware() {
  return NextResponse.next();
}

const realMiddleware = clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) {
    await auth.protect();
  }
});

export default isPreviewMode() ? previewMiddleware : realMiddleware;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

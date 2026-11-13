import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Signed-out visitors can only reach the public landing page and the auth
 * pages. This is defence in depth: the data itself is protected by
 * requireUser() in every Convex function, which works even if a route slipped
 * through here.
 */
const isProtectedRoute = createRouteMatcher(["/tools(.*)", "/listings(.*)", "/requests(.*)", "/incoming(.*)", "/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

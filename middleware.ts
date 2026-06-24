import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// /api/sync-odds and /api/admin are public at the middleware layer because they
// are called with `Authorization: Bearer CRON_SECRET` (not a Clerk session).
// Each route enforces its own auth: sync-odds uses CRON_SECRET for GET / a Clerk
// session for POST; /api/admin/* requires the CRON_SECRET bearer.
// /privacy and /terms are public so app-store reviewers (and the store listing)
// can reach them without an account.
const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/profile/(.*)', '/privacy', '/terms', '/api/sync-odds(.*)', '/api/admin(.*)']);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};

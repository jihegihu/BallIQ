import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// /api/sync-odds and /api/admin are public at the middleware layer because they
// are called with `Authorization: Bearer CRON_SECRET` (not a Clerk session).
// Each route enforces its own auth: sync-odds uses CRON_SECRET for GET / a Clerk
// session for POST; /api/admin/* requires the CRON_SECRET bearer.
// /privacy and /terms are public so app-store reviewers (and the store listing)
// can reach them without an account.
// /api/push/register is public at this layer for the sake of its DELETE: a
// device that has just signed out must still be able to say "stop sending
// notifications to me", and auth.protect() here would reject that request
// before the handler ever saw it — which is exactly how signed-out phones kept
// receiving "your picks settled". Its POST still requires a Clerk session;
// the route enforces that itself.
// /api/notify is listed WITHOUT a (.*) wildcard on purpose. It is cron-driven
// (Bearer CRON_SECRET) so it must bypass auth.protect(), but /api/notify/prefs
// underneath it is user-facing and has to keep its Clerk session check — a
// wildcard here would quietly open it.
const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/profile/(.*)', '/privacy', '/terms', '/api/sync-odds(.*)', '/api/admin(.*)', '/api/push/register', '/api/notify']);

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

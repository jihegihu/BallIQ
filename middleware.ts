import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// /api/sync-odds is public at the middleware layer because the Vercel cron job
// calls it with `Authorization: Bearer CRON_SECRET` (not a Clerk session).
// The route enforces its own auth: CRON_SECRET for GET, Clerk session for POST.
const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/profile/(.*)', '/api/sync-odds(.*)']);

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

// Auth for the operator / cron endpoints.
//
// Two accepted headers, on purpose:
//   * Authorization: Bearer <CRON_SECRET>  — what Vercel's scheduler sends
//     automatically, so this one is not optional.
//   * x-cron-secret: <CRON_SECRET>         — for curl and third-party cron.
//
// The second exists because Clerk's middleware inspects Authorization and
// tries to read it as a JWT. It does not block these routes, but it stamps
// "Invalid JWT form / token-invalid" onto the response, which makes an
// ordinary wrong-secret 401 look like a Clerk failure. x-cron-secret sidesteps
// that entirely and keeps debugging honest.

import { NextRequest } from 'next/server';

export type CronAuth =
  | { ok: true }
  | { ok: false; status: 503 | 401; error: string };

export function checkCronAuth(req: NextRequest): CronAuth {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 503, error: 'CRON_SECRET not configured on the server' };
  }
  const bearer = req.headers.get('authorization');
  const custom = req.headers.get('x-cron-secret');
  if (bearer === `Bearer ${secret}` || custom === secret) return { ok: true };
  return { ok: false, status: 401, error: 'Unauthorized' };
}

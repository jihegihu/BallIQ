// GET /api/stats — product numbers for the creator's eyes only.
//
// Answers the questions that decide what to build next: are people signing
// up, do they make it through onboarding, do they make picks, and do they
// come back. Anyone else gets a 404, as if the route did not exist.
//
// Signups, picks and activity come from tables that have always existed, so
// those numbers are right from day one. The onboarding funnel and "opened the
// app" need the events table (migration-010) and only count from the day it
// was created. The arithmetic itself is in lib/stats.ts.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { isCreator } from '@/lib/creator';
import { computeStats, type StatsUser, type StatsPick, type StatsEvent } from '@/lib/stats';

type Admin = ReturnType<typeof createAdminClient>;

const PAGE = 1000;
const MAX_PAGES = 30;

/** Read every row of a query, a page at a time (the database caps a request at 1,000). */
async function all<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const { data, error } = await build(p * PAGE, p * PAGE + PAGE - 1);
    if (error) return { rows, error: error.message };
    const got = (data ?? []) as T[];
    rows.push(...got);
    if (got.length < PAGE) break;
  }
  return { rows, error: null };
}

async function poolCounts(admin: Admin) {
  const { data, error } = await admin.from('pools').select('status');
  if (error) return null;
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.status as string] = (out[r.status as string] ?? 0) + 1;
  return out;
}

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const me    = await getOrCreateUser(clerkId);
  if (!isCreator(me)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now   = new Date();
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  const [users, picks, events, pools] = await Promise.all([
    all<StatsUser>((a, b) =>
      admin.from('users').select('id, clerk_id, created_at, total_picks').order('id').range(a, b)),
    all<StatsPick>((a, b) =>
      admin.from('user_picks').select('user_id, placed_at').gte('placed_at', since).order('id').range(a, b)),
    all<StatsEvent>((a, b) =>
      admin.from('events').select('user_id, name, props, created_at').gte('created_at', since).order('id').range(a, b)),
    poolCounts(admin),
  ]);

  return NextResponse.json({
    ...computeStats(users.rows, picks.rows, events.rows, now),
    // False until migration-010 is run; the page says so instead of showing zeros.
    eventsReady: events.error === null,
    pools,
  });
}

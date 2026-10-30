// POST /api/admin/resettle
//
// Puts auto-voided picks back in the queue so they can be graded properly.
//
// Why this exists: the odds cron stopped running for three weeks. The void
// sweep then marked every pick whose game was over as 'void' — not because the
// results were unknowable, but because our sync was down. Those picks never
// moved anyone's rating (the sweep writes elo_delta 0 and leaves users
// untouched), so flipping them back to 'pending' is safe and cannot
// double-count: the normal settle path in /api/sync-odds grades them from
// scratch, now with the ESPN fallback that can reach games older than The Odds
// API's 3-day lookback.
//
// Auth: Bearer CRON_SECRET. Operator endpoint — call it with curl, then run a
// sync. Picks ESPN still cannot resolve simply go void again after 7 days.
//
// Body (optional): { "sinceDays": 60 } — how far back to look. Default 60.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { checkCronAuth } from '@/lib/cronAuth';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({})) as { sinceDays?: number };
  const sinceDays = Number.isFinite(body.sinceDays) ? Number(body.sinceDays) : 60;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const admin = createAdminClient();

  // Void picks placed within the window. Paginated: there can be hundreds.
  const voided: { id: string; match_id: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('user_picks')
      .select('id, match_id')
      .eq('outcome', 'void')
      .gte('placed_at', since)
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const page = data ?? [];
    voided.push(...page as { id: string; match_id: string }[]);
    if (page.length < 1000) break;
  }

  if (voided.length === 0) {
    return NextResponse.json({ reset: 0, note: 'no void picks in window' });
  }

  // Only resurrect picks whose match row still exists — without it there is no
  // sport or kick-off time to look a score up by, so it could never grade.
  const matchIds = [...new Set(voided.map((p) => p.match_id).filter(Boolean))];
  const liveMatchIds = new Set<string>();
  for (let i = 0; i < matchIds.length; i += 200) {
    const { data } = await admin
      .from('matches')
      .select('id')
      .in('id', matchIds.slice(i, i + 200));
    for (const m of (data ?? [])) liveMatchIds.add(m.id as string);
  }

  const resettleIds = voided.filter((p) => liveMatchIds.has(p.match_id)).map((p) => p.id);
  const orphaned    = voided.length - resettleIds.length;

  let reset = 0;
  for (let i = 0; i < resettleIds.length; i += 200) {
    const slice = resettleIds.slice(i, i + 200);
    const { error } = await admin
      .from('user_picks')
      .update({ outcome: 'pending', elo_delta: null, resolved_at: null })
      .in('id', slice);
    if (error) return NextResponse.json({ error: error.message, reset }, { status: 500 });
    reset += slice.length;
  }

  return NextResponse.json({
    reset,
    orphaned,
    matchesInvolved: liveMatchIds.size,
    next: 'Run GET /api/sync-odds to grade them (ESPN fallback covers games older than 3 days).',
  });
}

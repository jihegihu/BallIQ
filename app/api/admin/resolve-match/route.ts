// POST /api/admin/resolve-match
// Records the team that advanced from a knockout tie decided on penalties (or
// any game the odds feed reports as level but that actually had a winner).
//
// Auth: Bearer CRON_SECRET (same secret the cron uses) — there is no admin UI;
// this is an operator endpoint called with curl/Postman.
//
// Body: { "matchId": "<odds api id>", "winner": "home" | "away" }
//
// Effect: sets matches.result_winner. The moneyline picks on that game are held
// pending by the resolver until this is set, so the NEXT sync (Refresh button
// or the daily cron, within ~72h of the game) settles them as win/loss.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured on the server' }, { status: 400 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { matchId, winner } = await req.json().catch(() => ({})) as { matchId?: string; winner?: string };
  if (!matchId || (winner !== 'home' && winner !== 'away')) {
    return NextResponse.json({ error: "Body requires matchId and winner ('home' | 'away')" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('matches')
    .update({ result_winner: winner })
    .eq('id', matchId)
    .select('id, home_team, away_team')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Match not found' }, { status: error ? 500 : 404 });
  }

  return NextResponse.json({
    ok: true,
    matchId,
    winner,
    advancing: winner === 'home' ? data.home_team : data.away_team,
    note: 'Winner recorded. Run a sync (Refresh, or wait for the daily cron) within ~72h to settle the held moneyline picks.',
  });
}

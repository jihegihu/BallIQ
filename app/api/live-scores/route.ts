// GET /api/live-scores
//
// Scores for games currently in progress, straight from ESPN.
//
// Deliberately NOT part of the odds sync. The Odds API bills per request, so
// anything frequent enough to feel live would eat the monthly budget — at ~26
// credits a sync, a 60-second refresh is ~37,000 credits a day. ESPN's
// scoreboard is free and unmetered, so this can be polled as often as a screen
// is actually being looked at and costs nothing.
//
// It also writes what it finds back to `matches`, so the board's own score
// display gets fresher without waiting for the next sync.
//
// Auth: ordinary Clerk session (the middleware covers it) — signed-in users
// only, which is enough to keep it from being a public scraping endpoint.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { fetchEspnScores } from '@/lib/espn';
import { rowToMatch } from '@/lib/matchRow';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// How far back a kick-off can be and still plausibly be in progress. Four
// hours clears an NFL game; beyond that the sync will settle it normally.
const IN_PROGRESS_HOURS = 4;

export async function GET() {
  const admin = createAdminClient();

  const since = new Date(Date.now() - IN_PROGRESS_HOURS * 60 * 60 * 1000).toISOString();
  const now   = new Date().toISOString();

  // "In progress" is defined by the clock, not by the stored status: a game
  // that kicked off ten minutes ago is live whether or not a sync has run
  // since. Relying on status would mean never showing a score until the next
  // sync, which is the whole problem this endpoint exists to solve.
  const { data, error } = await admin
    .from('matches')
    .select('*')
    .gte('commence_time', since)
    .lte('commence_time', now)
    .neq('status', 'completed')
    .order('commence_time', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const inProgress = (data ?? []).map(rowToMatch);
  if (inProgress.length === 0) {
    return NextResponse.json({ games: [], checked: 0 });
  }

  const scores = await fetchEspnScores(inProgress).catch((err) => {
    console.warn('[live-scores] ESPN lookup failed:', err);
    return [];
  });

  // Persist so the board and the picks page benefit too. ESPN only reports
  // `completed: true` for genuinely finished games, so a game still running
  // stays 'live' and remains eligible for normal settlement.
  await Promise.all(
    scores.map((s) =>
      admin.from('matches').update({
        home_score: s.homeScore,
        away_score: s.awayScore,
        status:     s.completed ? 'completed' : 'live',
      }).eq('id', s.id),
    ),
  );

  const byId = new Map(scores.map((s) => [s.id, s]));
  return NextResponse.json({
    checked: inProgress.length,
    games: inProgress.map((m) => {
      const s = byId.get(m.id);
      return {
        id:        m.id,
        sport:     m.sport,
        homeTeam:  m.homeTeam,
        awayTeam:  m.awayTeam,
        homeScore: s?.homeScore ?? m.homeScore ?? null,
        awayScore: s?.awayScore ?? m.awayScore ?? null,
        completed: s?.completed ?? false,
      };
    }),
  });
}

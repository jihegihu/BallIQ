// POST /api/sync-odds  — manual trigger (Sync button in the UI)
// GET  /api/sync-odds  — Vercel cron job (every 4 hours)
// Fetches live odds from The-Odds-API, upserts matches, auto-resolves picks.

import { NextRequest, NextResponse } from 'next/server';
import { fetchOdds, fetchScores, CompletedGame } from '@/lib/odds';
import { createAdminClient } from '@/lib/supabase';
import { calculateEloDelta, getKFactor } from '@/lib/elo';
import { Match, BetType, ConfidenceLevel } from '@/types';

function matchToRow(m: Match) {
  return {
    id:                m.id,
    sport:             m.sport,
    home_team:         m.homeTeam,
    away_team:         m.awayTeam,
    commence_time:     m.commenceTime,
    status:            m.status,
    moneyline_home:    m.moneylineHome,
    moneyline_away:    m.moneylineAway,
    spread_line:       m.spreadLine,
    spread_home_odds:  m.spreadHomeOdds,
    spread_away_odds:  m.spreadAwayOdds,
    over_under_line:   m.overUnderLine,
    over_odds:         m.overOdds,
    under_odds:        m.underOdds,
    event_elo_ml_home: m.eventElos.moneylineHome,
    event_elo_ml_away: m.eventElos.moneylineAway,
    event_elo_over:    m.eventElos.over,
    event_elo_under:   m.eventElos.under,
    event_elo_sp_home: m.eventElos.spreadHome,
    event_elo_sp_away: m.eventElos.spreadAway,
    synced_at:         new Date().toISOString(),
  };
}

function determineOutcome(
  betType: string,
  pickSide: string,
  game: CompletedGame,
  spreadLine: number | null,
  overUnderLine: number | null,
): 'win' | 'loss' | 'push' | null {
  const margin = game.homeScore - game.awayScore;

  if (betType === 'moneyline') {
    if (margin === 0) return 'push';
    return pickSide === 'home' ? (margin > 0 ? 'win' : 'loss') : (margin < 0 ? 'win' : 'loss');
  }

  if (betType === 'spread') {
    if (spreadLine === null) return null;
    const threshold = -spreadLine;
    if (margin === threshold) return 'push';
    const homeCovers = margin > threshold;
    return pickSide === 'home' ? (homeCovers ? 'win' : 'loss') : (homeCovers ? 'loss' : 'win');
  }

  if (betType === 'over_under') {
    if (overUnderLine === null) return null;
    const total = game.homeScore + game.awayScore;
    if (total === overUnderLine) return 'push';
    return pickSide === 'over' ? (total > overUnderLine ? 'win' : 'loss') : (total < overUnderLine ? 'win' : 'loss');
  }

  return null;
}

// Maps Sport type value → DB column name (soccer leagues share one column)
const SPORT_COL_MAP: Record<string, string> = {
  NBA:        'nba_elo',
  NFL:        'nfl_elo',
  MLB:        'mlb_elo',
  NCAA:       'ncaa_elo',
  EPL:        'soccer_elo',
  LALIGA:     'soccer_elo',
  BUNDESLIGA: 'soccer_elo',
  SERIEA:     'soccer_elo',
  TENNIS:     'tennis_elo',
};

// Vercel cron calls GET with Authorization: Bearer {CRON_SECRET}
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return runSync();
}

export async function POST() {
  return runSync();
}

async function runSync() {
  if (!process.env.ODDS_API_KEY) {
    return NextResponse.json({ error: 'ODDS_API_KEY not set' }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── 1. Sync upcoming odds ───────────────────────────────────────────────────
  const ALL_SPORTS = ['NBA', 'NFL', 'MLB', 'EPL', 'LALIGA', 'BUNDESLIGA', 'SERIEA', 'TENNIS'] as const;

  const matches = await fetchOdds([...ALL_SPORTS]).catch((err) => {
    return NextResponse.json({ error: String(err) }, { status: 502 }) as never;
  });

  if (!Array.isArray(matches)) return matches;

  if (matches.length > 0) {
    const { error } = await admin
      .from('matches')
      .upsert(matches.map(matchToRow), { onConflict: 'id' });

    if (error) {
      console.error('[sync-odds] upsert error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // ── 2. Fetch scores + auto-resolve ALL users' pending picks ─────────────────
  let scoresFetchError = '';
  const completedGames = await fetchScores([...ALL_SPORTS]).catch((err: Error) => {
    scoresFetchError = err.message;
    return [] as CompletedGame[];
  });
  let resolved = 0;

  if (completedGames.length > 0) {
    const completedIds = completedGames.map((g) => g.id);

    // Fetch ALL pending picks for any user — no user_id filter
    const { data: allPending } = await admin
      .from('user_picks')
      .select('id, user_id, match_id, bet_type, pick_side, confidence_level, event_elo, sport, spread_line, over_under_line')
      .eq('outcome', 'pending')
      .in('match_id', completedIds);

    const pendingPicks = allPending ?? [];

    if (pendingPicks.length > 0) {
      // Fetch match lines as a fallback for picks that predate the stored columns
      const matchIds = [...new Set(pendingPicks.map((p) => p.match_id as string))];
      const { data: matchRows } = await admin
        .from('matches')
        .select('id, spread_line, over_under_line')
        .in('id', matchIds);
      const matchLineMap = new Map(
        (matchRows ?? []).map((m) => [m.id as string, { spreadLine: m.spread_line as number, overUnderLine: m.over_under_line as number }]),
      );

      const gameMap = new Map(completedGames.map((g) => [g.id, g]));

      // Group picks by user_id so each user gets their own chained Elo calculation
      const byUser = new Map<string, typeof pendingPicks>();
      for (const pick of pendingPicks) {
        const uid = pick.user_id as string;
        if (!byUser.has(uid)) byUser.set(uid, []);
        byUser.get(uid)!.push(pick);
      }

      // Fetch all relevant users in one query
      const { data: usersData } = await admin
        .from('users')
        .select('id, global_elo, season_elo, total_picks, weeks_active, nba_elo, nfl_elo, mlb_elo, ncaa_elo, soccer_elo, tennis_elo')
        .in('id', [...byUser.keys()]);
      const usersMap = new Map((usersData ?? []).map((u) => [u.id as string, u]));

      type ResolvedUpdate = { id: string; outcome: 'win' | 'loss' | 'push'; elo_delta: number };
      const allUpdates: ResolvedUpdate[] = [];

      for (const [userId, userPicks] of byUser) {
        const userData = usersMap.get(userId);
        if (!userData) continue;

        const kFactor        = getKFactor(userData.total_picks as number, userData.weeks_active as number);
        let currentElo       = userData.global_elo as number;
        let currentSeasonElo = userData.season_elo as number;
        // Track per-DB-column Elo so multiple soccer leagues accumulate into one column
        const ud = userData as Record<string, unknown>;
        const colElos: Record<string, number> = {
          nba_elo:    (ud.nba_elo    as number) ?? 1200,
          nfl_elo:    (ud.nfl_elo    as number) ?? 1200,
          mlb_elo:    (ud.mlb_elo    as number) ?? 1200,
          ncaa_elo:   (ud.ncaa_elo   as number) ?? 1200,
          soccer_elo: (ud.soccer_elo as number) ?? 1200,
          tennis_elo: (ud.tennis_elo as number) ?? 1200,
        };

        const userUpdates: ResolvedUpdate[] = [];

        for (const pick of userPicks) {
          const game = gameMap.get(pick.match_id as string);
          if (!game) continue;

          // Use stored line first; fall back to live match data for older picks
          const fallback   = matchLineMap.get(pick.match_id as string);
          const spreadLine    = (pick.spread_line     ?? fallback?.spreadLine    ?? null) as number | null;
          const overUnderLine = (pick.over_under_line ?? fallback?.overUnderLine ?? null) as number | null;

          const outcome = determineOutcome(
            pick.bet_type as string,
            pick.pick_side as string,
            game,
            spreadLine,
            overUnderLine,
          );
          if (outcome === null) continue;

          const result = calculateEloDelta({
            userElo:         currentElo,
            eventElo:        pick.event_elo as number,
            kFactor,
            confidenceLevel: pick.confidence_level as ConfidenceLevel,
            betType:         pick.bet_type as BetType,
            outcome,
          });

          userUpdates.push({ id: pick.id as string, outcome, elo_delta: result.finalEloDelta });

          currentElo       = result.newElo;
          currentSeasonElo = Math.max(0, currentSeasonElo + result.finalEloDelta);
          const sport = pick.sport as string | null;
          if (sport && SPORT_COL_MAP[sport]) {
            const col = SPORT_COL_MAP[sport];
            colElos[col] = Math.max(0, colElos[col] + result.finalEloDelta);
          }
        }

        if (userUpdates.length > 0) {
          allUpdates.push(...userUpdates);

          await admin.from('users').update({
            global_elo: currentElo,
            season_elo: currentSeasonElo,
            ...colElos,
          }).eq('id', userId);
        }
      }

      if (allUpdates.length > 0) {
        const now = new Date().toISOString();
        await Promise.all(
          allUpdates.map((u) =>
            admin.from('user_picks').update({
              outcome:     u.outcome,
              elo_delta:   u.elo_delta,
              resolved_at: now,
            }).eq('id', u.id),
          ),
        );
        resolved = allUpdates.length;
      }
    }
  }

  return NextResponse.json({
    synced:   matches.length,
    resolved,
    ...(scoresFetchError && { scoresError: scoresFetchError }),
    ...(matches.length === 0 && { message: 'No upcoming matches — season may be off' }),
  });
}

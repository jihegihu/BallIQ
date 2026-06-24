// POST /api/sync-odds  — manual trigger (Sync button in the UI)
// GET  /api/sync-odds  — Vercel cron job (every 4 hours)
// Fetches live odds from The-Odds-API, upserts matches, auto-resolves picks.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { fetchOdds, fetchScores, CompletedGame, OddsQuotaError } from '@/lib/odds';
import { createAdminClient } from '@/lib/supabase';
import { calculateEloDelta, getKFactor } from '@/lib/elo';
import { Match, BetType, ConfidenceLevel, Sport } from '@/types';

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
  resultWinner: 'home' | 'away' | null = null,
): 'win' | 'loss' | 'push' | null {
  const margin = game.homeScore - game.awayScore;

  if (betType === 'moneyline') {
    if (margin === 0) {
      // Level after regulation/extra time. If an advancing team was recorded
      // (e.g. a penalty-shootout winner in a knockout tie), credit it; otherwise
      // it's a genuine draw → push.
      if (resultWinner === 'home' || resultWinner === 'away') {
        return pickSide === resultWinner ? 'win' : 'loss';
      }
      return 'push';
    }
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

// 2026 World Cup knockout stage begins after the group stage (~June 28). A
// knockout tie can't end level — a draw after extra time goes to penalties —
// so we hold those moneyline picks until an advancing team is recorded rather
// than settling them as a push. Group-stage draws (before this date) are real.
const WC_KNOCKOUT_START = new Date('2026-06-28T00:00:00Z').getTime();

function penaltiesPossible(sport: string | null, commenceTime: string | null): boolean {
  return sport === 'WORLDCUP' && !!commenceTime && new Date(commenceTime).getTime() >= WC_KNOCKOUT_START;
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
  WORLDCUP:   'soccer_elo',
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

// Manual sync from the UI — requires a signed-in user (route is public at the
// middleware layer so the cron GET can reach it).
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return runSync();
}

async function runSync() {
  if (!process.env.ODDS_API_KEY) {
    return NextResponse.json({ error: 'ODDS_API_KEY not set' }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── 1. Sync upcoming odds ───────────────────────────────────────────────────
  const ALL_SPORTS = ['NBA', 'NFL', 'MLB', 'EPL', 'LALIGA', 'BUNDESLIGA', 'SERIEA', 'WORLDCUP', 'TENNIS'] as const;

  // Quota/auth failures are recorded (not thrown) so the response can say so
  // plainly instead of the app silently behaving as if there were no games.
  let quotaExhausted: boolean = false;
  let oddsError = '';

  const matches = await fetchOdds([...ALL_SPORTS]).catch((err) => {
    if (err instanceof OddsQuotaError) quotaExhausted = true;
    else oddsError = err?.message ?? String(err);
    return [] as Match[];
  });

  if (matches.length > 0) {
    const { error } = await admin
      .from('matches')
      .upsert(matches.map(matchToRow), { onConflict: 'id' });

    if (error) {
      console.error('[sync-odds] upsert error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // ── 1b. House bot: always picks the moneyline favorite ──────────────────────
  // "BallIQ Baseline" (created by migration-003) gives the leaderboard a
  // benchmark — beating it means you out-predict naive favorite-picking.
  let botPicks = 0;
  if (matches.length > 0) {
    const { data: bot } = await admin
      .from('users')
      .select('id, global_elo, total_picks, weeks_active, created_at')
      .eq('clerk_id', 'bot_baseline')
      .maybeSingle();

    if (bot) {
      const lockCutoff = Date.now() + 15 * 60 * 1000;
      const open = matches.filter((m) => new Date(m.commenceTime).getTime() > lockCutoff);

      if (open.length > 0) {
        const botWeeks = bot.created_at
          ? Math.max(1, Math.floor((Date.now() - new Date(bot.created_at as string).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1)
          : Math.max(1, bot.weeks_active as number);
        const botK = getKFactor(bot.total_picks as number, botWeeks);

        const rows = open.map((m) => {
          // Lower event Elo = higher implied probability = the favorite
          const side     = m.eventElos.moneylineHome <= m.eventElos.moneylineAway ? 'home' : 'away';
          const eventElo = side === 'home' ? m.eventElos.moneylineHome : m.eventElos.moneylineAway;
          const proj     = calculateEloDelta({
            userElo: bot.global_elo as number, eventElo, kFactor: botK,
            confidenceLevel: 'medium', betType: 'moneyline', outcome: 'win',
          });
          return {
            user_id:           bot.id,
            match_id:          m.id,
            sport:             m.sport,
            match_description: `${m.homeTeam} vs ${m.awayTeam}`,
            spread_line:       m.spreadLine,
            over_under_line:   m.overUnderLine,
            bet_type:          'moneyline',
            pick_side:         side,
            confidence_level:  'medium',
            user_elo_at_pick:  bot.global_elo,
            event_elo:         eventElo,
            projected_gain:    proj.projectedGain,
            projected_loss:    proj.projectedLoss,
            outcome:           'pending',
            elo_delta:         null,
            xp_earned:         0,
            placed_at:         new Date().toISOString(),
          };
        });

        // ignoreDuplicates: games the bot already picked are skipped, so only
        // newly inserted rows come back
        const { data: inserted } = await admin
          .from('user_picks')
          .upsert(rows, { onConflict: 'user_id,match_id,bet_type', ignoreDuplicates: true })
          .select('id');

        botPicks = inserted?.length ?? 0;
        if (botPicks > 0) {
          await admin.from('users').update({
            total_picks:  (bot.total_picks as number) + botPicks,
            weeks_active: botWeeks,
          }).eq('id', bot.id);
        }
      }
    }
  }

  // ── 2. Fetch scores + auto-resolve ALL users' pending picks ─────────────────
  // Only fetch scores for sports that actually have pending picks — the single
  // biggest lever on Odds API usage. Off-season sports cost zero requests, and
  // if nothing is pending we skip the scores call entirely.
  const { data: pendingSportRows } = await admin
    .from('user_picks')
    .select('sport')
    .eq('outcome', 'pending');
  const pendingSports = [...new Set(
    (pendingSportRows ?? []).map((r) => r.sport as Sport | null).filter((s): s is Sport => !!s),
  )];

  let scoresFetchError = '';
  const scoredGames = pendingSports.length === 0
    ? []
    : await fetchScores(pendingSports).catch((err: Error) => {
        if (err instanceof OddsQuotaError) quotaExhausted = true;
        else scoresFetchError = err.message;
        return [] as CompletedGame[];
      });
  let resolved = 0;

  // Persist live + final scores so the picks page can show a real score ticker
  if (scoredGames.length > 0) {
    await Promise.all(
      scoredGames.map((g) =>
        admin.from('matches').update({
          home_score: g.homeScore,
          away_score: g.awayScore,
          status:     g.completed ? 'completed' : 'live',
        }).eq('id', g.id),
      ),
    );
  }

  const completedGames = scoredGames.filter((g) => g.completed);

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
        .select('id, spread_line, over_under_line, commence_time, result_winner')
        .in('id', matchIds);
      const matchInfoMap = new Map(
        (matchRows ?? []).map((m) => [m.id as string, {
          spreadLine:    m.spread_line as number,
          overUnderLine: m.over_under_line as number,
          commenceTime:  m.commence_time as string,
          resultWinner:  (m.result_winner ?? null) as 'home' | 'away' | null,
        }]),
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
        .select('id, global_elo, season_elo, total_picks, weeks_active, created_at, nba_elo, nfl_elo, mlb_elo, ncaa_elo, soccer_elo, tennis_elo')
        .in('id', [...byUser.keys()]);
      const usersMap = new Map((usersData ?? []).map((u) => [u.id as string, u]));

      type ResolvedUpdate = { id: string; outcome: 'win' | 'loss' | 'push'; elo_delta: number };
      const allUpdates: ResolvedUpdate[] = [];

      for (const [userId, userPicks] of byUser) {
        const userData = usersMap.get(userId);
        if (!userData) continue;

        // weeks_active is derived from account age — nothing else increments it,
        // so without this the K-factor would stay at the newcomer maximum forever
        const weeksActive = userData.created_at
          ? Math.max(1, Math.floor((Date.now() - new Date(userData.created_at as string).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1)
          : Math.max(1, userData.weeks_active as number);
        const kFactor        = getKFactor(userData.total_picks as number, weeksActive);
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
          const info   = matchInfoMap.get(pick.match_id as string);
          const spreadLine    = (pick.spread_line     ?? info?.spreadLine    ?? null) as number | null;
          const overUnderLine = (pick.over_under_line ?? info?.overUnderLine ?? null) as number | null;
          const resultWinner  = info?.resultWinner ?? null;

          // Hold a knockout tie's moneyline picks until the advancing team is
          // recorded (admin sets result_winner; a later sync then settles them).
          // Leaving them pending — rather than pushing — is what makes a
          // penalty-shootout winner creditable after the fact.
          if (
            pick.bet_type === 'moneyline' &&
            game.homeScore === game.awayScore &&
            !resultWinner &&
            penaltiesPossible(pick.sport as string | null, info?.commenceTime ?? null)
          ) {
            continue;
          }

          const outcome = determineOutcome(
            pick.bet_type as string,
            pick.pick_side as string,
            game,
            spreadLine,
            overUnderLine,
            resultWinner,
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
            global_elo:   currentElo,
            season_elo:   currentSeasonElo,
            weeks_active: weeksActive,
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

  // ── 3. Auto-void picks whose game finished 72h+ ago but never resolved ────────
  // Keyed on the GAME's start time, not when the pick was placed: fixtures are
  // often known days ahead (e.g. World Cup), so voiding by placement age would
  // wrongly kill picks before their game is even played.
  let voided = 0;
  const voidCutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const { data: stalePicks } = await admin
    .from('user_picks')
    .select('id, match_id, placed_at')
    .eq('outcome', 'pending');

  if (stalePicks && stalePicks.length > 0) {
    const staleMatchIds = [...new Set(stalePicks.map((p) => p.match_id as string).filter(Boolean))];
    const { data: commenceRows } = staleMatchIds.length > 0
      ? await admin.from('matches').select('id, commence_time').in('id', staleMatchIds)
      : { data: [] as { id: string; commence_time: string }[] };
    const commenceMap = new Map((commenceRows ?? []).map((m) => [m.id as string, m.commence_time as string]));

    const toVoid = stalePicks
      .filter((p) => {
        const commence = commenceMap.get(p.match_id as string);
        // Game long over → void. Orphaned pick with no match row → fall back to
        // placement age so it can't linger forever.
        return commence ? commence < voidCutoff : (p.placed_at as string) < voidCutoff;
      })
      .map((p) => p.id as string);

    if (toVoid.length > 0) {
      await admin.from('user_picks').update({
        outcome:     'void',
        elo_delta:   0,
        resolved_at: new Date().toISOString(),
      }).in('id', toVoid);
      voided = toVoid.length;
    }
  }

  return NextResponse.json({
    synced:   matches.length,
    resolved,
    ...(botPicks > 0 ? { botPicks } : {}),
    ...(voided > 0   ? { voided }   : {}),
    ...(quotaExhausted
      ? { quotaExhausted: true, error: 'Odds API monthly limit reached — new games and results are paused until the quota resets.' }
      : oddsError       ? { oddsError }
      : scoresFetchError ? { scoresError: scoresFetchError }
      : matches.length === 0 ? { message: 'No upcoming matches — season may be off' }
      : {}),
  });
}

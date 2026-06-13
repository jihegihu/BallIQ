// GET    /api/picks — load picks + user state for the authenticated user
// POST   /api/picks — persist a new pick (all game-economy values computed server-side)
// DELETE /api/picks — cancel a pending pick (only before the game locks)

import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { calculateEloDelta, getKFactor } from '@/lib/elo';
import { calculateXP, projectStreak } from '@/lib/xp';
import { UserPick, BetType, PickSide, ConfidenceLevel, PickOutcome, Sport } from '@/types';

// Picks lock 15 minutes before tip-off — same threshold the UI uses.
const LOCK_WINDOW_MS = 15 * 60 * 1000;

function isLocked(commenceTime: string): boolean {
  return new Date(commenceTime).getTime() - Date.now() < LOCK_WINDOW_MS;
}

function rowToUserPick(
  row: Record<string, unknown>,
  match?: { sport?: string; commence_time?: string; spread_line?: number; over_under_line?: number } | null,
): UserPick {
  return {
    id:               row.id as string,
    matchId:          row.match_id as string,
    sport:            ((match?.sport ?? row.sport) as Sport | undefined),
    gameTime:         (match?.commence_time ?? undefined) as string | undefined,
    // row values take priority (stored at pick time); match join is fallback for older picks
    spreadLine:       (row.spread_line ?? match?.spread_line) as number | undefined,
    overUnderLine:    (row.over_under_line ?? match?.over_under_line) as number | undefined,
    matchDescription: row.match_description as string,
    betType:          row.bet_type as BetType,
    pickSide:         row.pick_side as PickSide,
    confidenceLevel:  row.confidence_level as ConfidenceLevel,
    userEloAtPick:    row.user_elo_at_pick as number,
    eventElo:         row.event_elo as number,
    projectedGain:    row.projected_gain as number,
    projectedLoss:    row.projected_loss as number,
    outcome:          row.outcome as PickOutcome,
    eloDelta:         row.elo_delta as number | null,
    xpEarned:         row.xp_earned as number,
    placedAt:         row.placed_at as string,
    resolvedAt:       row.resolved_at as string | null,
  };
}

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clerkUser = await currentUser();
  const fullName  = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ');
  const username  =
    clerkUser?.username ??
    (fullName || clerkUser?.emailAddresses?.[0]?.emailAddress?.split('@')[0]) ??
    'Player';

  const admin  = createAdminClient();
  const userId = await getOrCreateUser(clerkId, username);

  const [picksResult, userResult] = await Promise.all([
    admin
      .from('user_picks')
      .select('*')
      .eq('user_id', userId)
      .order('placed_at', { ascending: true }),
    admin
      .from('users')
      .select('username, global_elo, season_elo, xp_total, total_picks, weeks_active, last_pick_date, current_streak, nba_elo, nfl_elo, mlb_elo, ncaa_elo, soccer_elo, tennis_elo')
      .eq('id', userId)
      .single(),
  ]);

  const pickRows = picksResult.data ?? [];

  const matchIds = [...new Set(pickRows.map((r) => r.match_id as string).filter(Boolean))];
  const { data: matchRows } = matchIds.length > 0
    ? await admin.from('matches').select('id, sport, commence_time, spread_line, over_under_line').in('id', matchIds)
    : { data: [] as { id: string; sport: string; commence_time: string; spread_line: number; over_under_line: number }[] };
  const matchMap = new Map((matchRows ?? []).map((m) => [m.id, m]));

  const picks = pickRows.map((row) => rowToUserPick(row, matchMap.get(row.match_id as string) ?? null));
  const user  = userResult.data ?? null;

  return NextResponse.json({
    picks,
    user: user ? {
      username:      user.username ?? username,
      globalElo:     user.global_elo,
      seasonElo:     user.season_elo,
      sportElos: {
        NBA:        (user as any).nba_elo    ?? 1200,
        NFL:        (user as any).nfl_elo    ?? 1200,
        MLB:        (user as any).mlb_elo    ?? 1200,
        NCAA:       (user as any).ncaa_elo   ?? 1200,
        EPL:        (user as any).soccer_elo ?? 1200,
        LALIGA:     (user as any).soccer_elo ?? 1200,
        BUNDESLIGA: (user as any).soccer_elo ?? 1200,
        SERIEA:     (user as any).soccer_elo ?? 1200,
        WORLDCUP:   (user as any).soccer_elo ?? 1200,
        TENNIS:     (user as any).tennis_elo ?? 1200,
      },
      xpTotal:       user.xp_total,
      totalPicks:    user.total_picks,
      weeksActive:   user.weeks_active,
      lastPickDate:  user.last_pick_date,
      currentStreak: user.current_streak,
    } : null,
  });
}

const VALID_CONFIDENCE = new Set(['low', 'medium', 'high']);
const VALID_SIDES: Record<string, Set<string>> = {
  moneyline:  new Set(['home', 'away']),
  spread:     new Set(['home', 'away']),
  over_under: new Set(['over', 'under']),
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The client sends its optimistic pick, but everything that affects the game
// economy (event Elo, lines, projections, XP) is recomputed here from the DB.
// Trusting the client for event_elo would let anyone forge high-reward picks.
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as Partial<UserPick> | null;
  if (!body?.matchId || !body.betType || !body.pickSide) {
    return NextResponse.json({ saved: false, reason: 'matchId, betType and pickSide are required' }, { status: 400 });
  }

  const betType         = body.betType as string;
  const pickSide        = body.pickSide as string;
  const confidenceLevel = (body.confidenceLevel ?? 'medium') as ConfidenceLevel;

  if (!VALID_SIDES[betType]?.has(pickSide) || !VALID_CONFIDENCE.has(confidenceLevel)) {
    return NextResponse.json({ saved: false, reason: 'Invalid bet type, side, or confidence' }, { status: 400 });
  }

  const admin  = createAdminClient();
  const userId = await getOrCreateUser(clerkId);

  const [{ data: match }, { data: u }] = await Promise.all([
    admin.from('matches').select('*').eq('id', body.matchId).single(),
    admin
      .from('users')
      .select('global_elo, total_picks, weeks_active, xp_total, last_pick_date, current_streak, created_at')
      .eq('id', userId)
      .single(),
  ]);

  if (!match) return NextResponse.json({ saved: false, reason: 'Match not found' }, { status: 404 });
  if (!u)     return NextResponse.json({ saved: false, reason: 'User not found' },  { status: 404 });

  if (isLocked(match.commence_time as string)) {
    return NextResponse.json({ saved: false, reason: 'Picks are locked for this game' }, { status: 409 });
  }

  // Server-side event Elo from the synced odds — never from the request body
  const eventElo: number | null =
    betType === 'moneyline'  ? (pickSide === 'home' ? match.event_elo_ml_home : match.event_elo_ml_away) :
    betType === 'spread'     ? (pickSide === 'home' ? match.event_elo_sp_home : match.event_elo_sp_away) :
    /* over_under */           (pickSide === 'over' ? match.event_elo_over    : match.event_elo_under);

  if (eventElo == null) {
    return NextResponse.json({ saved: false, reason: 'Odds unavailable for this market' }, { status: 409 });
  }

  const weeksActive = u.created_at
    ? Math.max(1, Math.floor((Date.now() - new Date(u.created_at as string).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1)
    : Math.max(1, u.weeks_active as number);
  const kFactor = getKFactor(u.total_picks as number, weeksActive);

  const proj = calculateEloDelta({
    userElo:  u.global_elo as number,
    eventElo,
    kFactor,
    confidenceLevel,
    betType: betType as BetType,
    outcome: 'win',
  });

  const today           = new Date().toISOString().split('T')[0];
  const projectedStreak = projectStreak(u.last_pick_date as string | null, u.current_streak as number);
  const xpEarned        = calculateXP({
    isFirstToday: u.last_pick_date !== today,
    projectedStreak,
    betType: betType as BetType,
    confidenceLevel,
  });

  // Accept the client's UUID so the optimistic store entry lines up; generate
  // one otherwise. The PK constraint rejects collisions.
  const pickId = (typeof body.id === 'string' && UUID_RE.test(body.id)) ? body.id : crypto.randomUUID();

  const { error } = await admin.from('user_picks').insert({
    id:                pickId,
    user_id:           userId,
    match_id:          match.id,
    sport:             match.sport,
    match_description: `${match.home_team} vs ${match.away_team}`,
    spread_line:       match.spread_line,
    over_under_line:   match.over_under_line,
    bet_type:          betType,
    pick_side:         pickSide,
    confidence_level:  confidenceLevel,
    user_elo_at_pick:  u.global_elo,
    event_elo:         eventElo,
    projected_gain:    proj.projectedGain,
    projected_loss:    proj.projectedLoss,
    outcome:           'pending',
    elo_delta:         null,
    xp_earned:         xpEarned,
    placed_at:         new Date().toISOString(),
  });

  if (error) {
    console.warn('[POST /api/picks]', error.message);
    return NextResponse.json({ saved: false, reason: error.message });
  }

  await admin.from('users').update({
    xp_total:       (u.xp_total ?? 0) + xpEarned,
    total_picks:    (u.total_picks ?? 0) + 1,
    last_pick_date: today,
    current_streak: projectedStreak,
    weeks_active:   weeksActive,
  }).eq('id', userId);

  return NextResponse.json({ saved: true, pickId, xpEarned });
}

export async function DELETE(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pickId = new URL(req.url).searchParams.get('pickId');
  if (!pickId) return NextResponse.json({ error: 'pickId required' }, { status: 400 });

  const admin  = createAdminClient();
  const userId = await getOrCreateUser(clerkId);

  const { data: pick } = await admin
    .from('user_picks')
    .select('id, xp_earned, match_id, outcome')
    .eq('id', pickId)
    .eq('user_id', userId)
    .eq('outcome', 'pending')
    .single();

  if (!pick) return NextResponse.json({ deleted: false, reason: 'Pick not found or already settled' }, { status: 404 });

  // No cancelling once the game locks — otherwise users could free-roll by
  // dropping losing picks mid-game.
  const { data: match } = await admin
    .from('matches')
    .select('commence_time')
    .eq('id', pick.match_id)
    .single();

  if (match && isLocked(match.commence_time as string)) {
    return NextResponse.json({ deleted: false, reason: 'Game has locked — pick can no longer be cancelled' }, { status: 409 });
  }

  const { error } = await admin
    .from('user_picks')
    .delete()
    .eq('id', pickId)
    .eq('user_id', userId)
    .eq('outcome', 'pending');

  if (error) return NextResponse.json({ deleted: false, reason: error.message }, { status: 500 });

  // Roll back the XP / pick-count granted at placement (streak is left alone)
  const { data: cur } = await admin
    .from('users')
    .select('xp_total, total_picks')
    .eq('id', userId)
    .single();

  if (cur) {
    await admin.from('users').update({
      xp_total:    Math.max(0, (cur.xp_total ?? 0) - (pick.xp_earned ?? 0)),
      total_picks: Math.max(0, (cur.total_picks ?? 0) - 1),
    }).eq('id', userId);
  }

  return NextResponse.json({ deleted: true });
}

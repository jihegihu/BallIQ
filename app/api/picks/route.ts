// GET  /api/picks — load picks + user state for the authenticated user
// POST /api/picks — persist a new pick to Supabase

import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { UserPick, BetType, PickSide, ConfidenceLevel, PickOutcome, Sport } from '@/types';

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

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pick: UserPick = await req.json();
  const admin  = createAdminClient();
  const userId = await getOrCreateUser(clerkId);

  const { error } = await admin.from('user_picks').insert({
    id:                pick.id,
    user_id:           userId,
    match_id:          pick.matchId,
    sport:             pick.sport,
    match_description: pick.matchDescription,
    spread_line:       pick.spreadLine ?? null,
    over_under_line:   pick.overUnderLine ?? null,
    bet_type:          pick.betType,
    pick_side:         pick.pickSide,
    confidence_level:  pick.confidenceLevel,
    user_elo_at_pick:  pick.userEloAtPick,
    event_elo:         pick.eventElo,
    projected_gain:    pick.projectedGain,
    projected_loss:    pick.projectedLoss,
    outcome:           pick.outcome,
    elo_delta:         pick.eloDelta,
    xp_earned:         pick.xpEarned,
    placed_at:         pick.placedAt,
  });

  if (error) {
    console.warn('[POST /api/picks]', error.message);
    return NextResponse.json({ saved: false, reason: error.message });
  }

  const today = new Date().toISOString().split('T')[0];
  const { data: cur } = await admin
    .from('users')
    .select('xp_total, total_picks, last_pick_date, current_streak')
    .eq('id', userId)
    .single();

  if (cur) {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
    const newStreak =
      cur.last_pick_date === today     ? cur.current_streak :
      cur.last_pick_date === yesterday ? cur.current_streak + 1 :
      1;

    await admin.from('users').update({
      xp_total:       (cur.xp_total ?? 0) + pick.xpEarned,
      total_picks:    (cur.total_picks ?? 0) + 1,
      last_pick_date: today,
      current_streak: newStreak,
    }).eq('id', userId);
  }

  return NextResponse.json({ saved: true });
}

export async function DELETE(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pickId = new URL(req.url).searchParams.get('pickId');
  if (!pickId) return NextResponse.json({ error: 'pickId required' }, { status: 400 });

  const admin  = createAdminClient();
  const userId = await getOrCreateUser(clerkId);

  await admin
    .from('user_picks')
    .delete()
    .eq('id', pickId)
    .eq('user_id', userId)
    .eq('outcome', 'pending');

  return NextResponse.json({ deleted: true });
}

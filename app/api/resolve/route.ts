// POST /api/resolve
// Resolves a pick in Supabase and updates the user's Elo.
// Body: { pickId: string, outcome: 'win' | 'loss' | 'push' }

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { calculateEloDelta, getKFactor } from '@/lib/elo';
import { BetType, ConfidenceLevel } from '@/types';

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { pickId, outcome } = await req.json() as {
    pickId: string;
    outcome: 'win' | 'loss' | 'push';
  };

  const admin  = createAdminClient();
  const userId = await getOrCreateUser(clerkId);

  const { data: pick, error: pickErr } = await admin
    .from('user_picks')
    .select('*')
    .eq('id', pickId)
    .eq('user_id', userId)  // ensure the pick belongs to this user
    .single();

  if (pickErr || !pick) {
    return NextResponse.json({ saved: false });
  }

  const { data: user, error: userErr } = await admin
    .from('users')
    .select('global_elo, season_elo, total_picks, weeks_active, nba_elo, nfl_elo, mlb_elo, ncaa_elo')
    .eq('id', userId)
    .single();

  if (userErr || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const kFactor = getKFactor(user.total_picks, user.weeks_active);
  const result  = calculateEloDelta({
    userElo:         user.global_elo,
    eventElo:        pick.event_elo,
    kFactor,
    confidenceLevel: pick.confidence_level as ConfidenceLevel,
    betType:         pick.bet_type as BetType,
    outcome,
  });

  const sportColumnMap: Record<string, string> = {
    NBA: 'nba_elo', NFL: 'nfl_elo', MLB: 'mlb_elo', NCAA: 'ncaa_elo',
  };
  const sportCol    = pick.sport ? (sportColumnMap[pick.sport] ?? null) : null;
  const userUpdate: Record<string, unknown> = {
    global_elo: result.newElo,
    season_elo: Math.max(0, user.season_elo + result.finalEloDelta),
  };
  if (sportCol) {
    const currentSportElo = ((user as Record<string, unknown>)[sportCol] as number | null) ?? 1200;
    userUpdate[sportCol]  = Math.max(0, currentSportElo + result.finalEloDelta);
  }

  await Promise.all([
    admin.from('user_picks').update({
      outcome,
      elo_delta:   result.finalEloDelta,
      resolved_at: new Date().toISOString(),
    }).eq('id', pickId),

    admin.from('users').update(userUpdate).eq('id', userId),
  ]);

  return NextResponse.json({ saved: true, newElo: result.newElo, eloDelta: result.finalEloDelta });
}

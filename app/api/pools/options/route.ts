// GET /api/pools/options — everything the "start a pool" screen needs:
// which slates exist per sport right now, which friends can be invited, and
// which sport/week slots this player has already used.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { POOL_SPORTS, slateOptions, POOL_MIN_SETTLED_PICKS } from '@/lib/pools';
import { settledPickCount, loadSlateGames } from '@/lib/poolsServer';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const me    = await getOrCreateUser(clerkId);

  const [settled, followRes, joinedRes, ...slates] = await Promise.all([
    settledPickCount(admin, me),
    admin.from('follows').select('followee_id').eq('follower_id', me),
    admin.from('pool_members').select('pool_id').eq('user_id', me).eq('status', 'joined'),
    ...POOL_SPORTS.map((s) => loadSlateGames(admin, s)),
  ]);

  const friendIds = (followRes.data ?? []).map((f) => f.followee_id as string);
  const { data: friends } = friendIds.length > 0
    ? await admin.from('users').select('id, username, global_elo').in('id', friendIds).order('username')
    : { data: [] };

  const joinedIds = (joinedRes.data ?? []).map((r) => r.pool_id as string);
  const { data: joinedPools } = joinedIds.length > 0
    ? await admin.from('pools').select('sport, week_key').in('id', joinedIds).neq('status', 'cancelled')
    : { data: [] };
  const taken = new Set((joinedPools ?? []).map((p) => `${p.sport}|${p.week_key}`));

  const sports = POOL_SPORTS.map((sport, i) => ({
    sport,
    options: slateOptions(sport, slates[i]).map((o) => ({
      key: o.key,
      nights: o.nights,
      label: o.label,
      locksAt: o.locksAt,
      games: o.games.map((g) => ({ id: g.id, home: g.home_team, away: g.away_team, at: g.commence_time })),
      // One pool per sport per week: say so up front, not after they tap create.
      taken: taken.has(`${sport}|${o.weekKey}`),
    })),
  }));

  return NextResponse.json({
    eligible: { ok: settled >= POOL_MIN_SETTLED_PICKS, settled, needed: POOL_MIN_SETTLED_PICKS },
    friends: friends ?? [],
    sports,
  });
}

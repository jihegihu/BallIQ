// One head-to-head pool.
//
//   GET  /api/pools/:id                       — the slate, my picks, the standings
//   POST /api/pools/:id  { action, ... }      — join | decline | leave | cancel |
//                                               invite { userIds } | pick { matchId, side }
//
// Only people who were invited (or have joined) can see a pool at all. Other
// players' picks stay hidden until that game starts, so nobody can wait and
// copy the room.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { isLocked } from '@/lib/lock';
import {
  allowsDraw, resultOf, potentialWin,
  POOL_MIN_SETTLED_PICKS, POOL_MAX_MEMBERS,
  type MatchResultRow, type PoolSide,
} from '@/lib/pools';
import { settledPickCount, conflictingPool } from '@/lib/poolsServer';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };
type Admin = ReturnType<typeof createAdminClient>;

/** The pool and the caller's membership row, or null if they have no business here. */
async function load(admin: Admin, poolId: string, me: string) {
  if (!UUID.test(poolId)) return null;
  const [{ data: pool }, { data: member }] = await Promise.all([
    admin.from('pools').select('*').eq('id', poolId).maybeSingle(),
    admin.from('pool_members').select('*').eq('pool_id', poolId).eq('user_id', me).maybeSingle(),
  ]);
  if (!pool || !member) return null;
  return { pool, member };
}

function phaseOf(pool: Record<string, unknown>): 'open' | 'live' | 'settled' | 'cancelled' {
  if (pool.status === 'settled') return 'settled';
  if (pool.status === 'cancelled') return 'cancelled';
  return new Date(pool.locks_at as string).getTime() <= Date.now() ? 'live' : 'open';
}

export async function GET(_req: Request, { params }: Ctx) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const admin = createAdminClient();
  const me    = await getOrCreateUser(clerkId);

  const found = await load(admin, id, me);
  if (!found) return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
  const { pool, member } = found;

  const [{ data: memberRows }, { data: slateRows }, { data: pickRows }] = await Promise.all([
    admin.from('pool_members').select('user_id, status, correct, elo_delta').eq('pool_id', id).in('status', ['joined', 'invited']),
    admin.from('pool_matches').select('match_id').eq('pool_id', id),
    admin.from('pool_picks').select('user_id, match_id, pick_side').eq('pool_id', id),
  ]);

  const matchIds = (slateRows ?? []).map((s) => s.match_id as string);
  const userIds  = (memberRows ?? []).map((m) => m.user_id as string);

  const [{ data: matchRows }, { data: userRows }] = await Promise.all([
    matchIds.length > 0
      ? admin.from('matches')
          .select('id, home_team, away_team, commence_time, status, home_score, away_score, result_winner')
          .in('id', matchIds)
          .order('commence_time', { ascending: true })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    userIds.length > 0
      ? admin.from('users').select('id, username, global_elo').in('id', userIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const names = new Map((userRows ?? []).map((u) => [u.id as string, u.username as string]));
  const joinedIds = new Set((memberRows ?? []).filter((m) => m.status === 'joined').map((m) => m.user_id as string));
  const picks = pickRows ?? [];

  const results = new Map<string, PoolSide>();
  const matches = (matchRows ?? []).map((m) => {
    const mid = m.id as string;
    const started = isLocked(m.commence_time as string);
    const result = resultOf(m as unknown as MatchResultRow);
    if (result) results.set(mid, result);

    return {
      id: mid,
      home: m.home_team, away: m.away_team,
      at: m.commence_time,
      started,
      status: m.status,
      homeScore: m.home_score, awayScore: m.away_score,
      result,
      myPick: (picks.find((p) => p.user_id === me && p.match_id === mid)?.pick_side as PoolSide | undefined) ?? null,
      // Everyone else's side, only once the game has started.
      others: started
        ? picks
            .filter((p) => p.match_id === mid && p.user_id !== me && joinedIds.has(p.user_id as string))
            .map((p) => ({ userId: p.user_id, side: p.pick_side }))
        : null,
    };
  });

  const settled = pool.status === 'settled';
  const members = (memberRows ?? [])
    .map((m) => {
      const uid = m.user_id as string;
      const mine = picks.filter((p) => p.user_id === uid);
      return {
        userId: uid,
        username: names.get(uid) ?? 'Player',
        status: m.status,
        picksMade: mine.length,
        // The recorded figure once settled; a running count from finished
        // games until then.
        correct: settled && m.correct != null
          ? (m.correct as number)
          : mine.filter((p) => results.get(p.match_id as string) === p.pick_side).length,
        eloDelta: (m.elo_delta as number | null) ?? null,
      };
    })
    .sort((a, b) =>
      (a.status === 'joined' ? 0 : 1) - (b.status === 'joined' ? 0 : 1) ||
      b.correct - a.correct ||
      a.username.localeCompare(b.username));

  const joined = joinedIds.size;
  return NextResponse.json({
    pool: {
      id: pool.id, sport: pool.sport, title: pool.title, stake: pool.stake,
      phase: phaseOf(pool),
      locksAt: pool.locks_at, endsAt: pool.ends_at,
      creatorId: pool.creator_id,
      allowsDraw: allowsDraw(pool.sport as string),
      decided: results.size,
    },
    me: { id: me, status: member.status, isCreator: pool.creator_id === me },
    joined,
    potentialWin: potentialWin(joined, pool.stake as number),
    matches,
    members,
  });
}

export async function POST(req: Request, { params }: Ctx) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => ({})) as {
    action?: string; matchId?: unknown; side?: unknown; userIds?: unknown;
  };

  const admin = createAdminClient();
  const me    = await getOrCreateUser(clerkId);

  const found = await load(admin, id, me);
  if (!found) return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
  const { pool, member } = found;
  const phase = phaseOf(pool);
  const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

  switch (body.action) {
    case 'join': {
      if (phase !== 'open') return fail('This pool has already locked', 409);
      if (member.status === 'joined') return NextResponse.json({ ok: true });

      const settled = await settledPickCount(admin, me);
      if (settled < POOL_MIN_SETTLED_PICKS) {
        return fail(`You need ${POOL_MIN_SETTLED_PICKS} settled picks to play head to head. You have ${settled}.`, 403);
      }
      if (await conflictingPool(admin, me, pool.sport as string, pool.week_key as string, id)) {
        return fail(`You are already in a ${pool.sport} pool this week`, 409);
      }
      const { count } = await admin.from('pool_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('pool_id', id).eq('status', 'joined');
      if ((count ?? 0) >= POOL_MAX_MEMBERS) return fail('This pool is full', 409);

      const { error } = await admin.from('pool_members')
        .update({ status: 'joined', joined_at: new Date().toISOString() })
        .eq('pool_id', id).eq('user_id', me);
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
    }

    case 'decline':
    case 'leave': {
      // Once the first game has started the stake is committed. Letting
      // someone walk away then would let them dodge a pool they are losing.
      if (phase !== 'open') return fail('This pool has already locked', 409);
      if (pool.creator_id === me) return fail('Cancel the pool instead', 400);
      await Promise.all([
        admin.from('pool_members').update({ status: 'declined' }).eq('pool_id', id).eq('user_id', me),
        admin.from('pool_picks').delete().eq('pool_id', id).eq('user_id', me),
      ]);
      return NextResponse.json({ ok: true });
    }

    case 'cancel': {
      if (pool.creator_id !== me) return fail('Only the creator can cancel', 403);
      if (phase !== 'open') return fail('This pool has already locked', 409);
      await admin.from('pools')
        .update({ status: 'cancelled', settled_at: new Date().toISOString() })
        .eq('id', id).eq('status', 'open');
      return NextResponse.json({ ok: true });
    }

    case 'invite': {
      if (pool.creator_id !== me) return fail('Only the creator can invite', 403);
      if (phase !== 'open') return fail('This pool has already locked', 409);
      const ids = Array.isArray(body.userIds)
        ? [...new Set(body.userIds.filter((x): x is string => typeof x === 'string' && UUID.test(x)))]
        : [];
      if (ids.length === 0) return fail('Choose someone to invite');

      // Only people the creator follows.
      const { data: followRows } = await admin.from('follows')
        .select('followee_id').eq('follower_id', me).in('followee_id', ids);
      const allowed = (followRows ?? []).map((f) => f.followee_id as string).filter((u) => u !== me);
      if (allowed.length === 0) return fail('You can only invite players you follow');

      // ignoreDuplicates: someone who already joined or declined keeps their
      // row exactly as it is.
      const { error } = await admin.from('pool_members').upsert(
        allowed.map((u) => ({ pool_id: id, user_id: u, status: 'invited', invited_by: me })),
        { onConflict: 'pool_id,user_id', ignoreDuplicates: true },
      );
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true, invited: allowed.length });
    }

    case 'pick': {
      if (member.status !== 'joined') return fail('Join the pool first', 403);
      if (phase === 'settled' || phase === 'cancelled') return fail('This pool is finished', 409);

      const matchId = typeof body.matchId === 'string' ? body.matchId : '';
      const side = body.side;
      const valid = side === 'home' || side === 'away' || (side === 'draw' && allowsDraw(pool.sport as string));
      if (!matchId || !valid) return fail('Invalid pick');

      // The game must be on this pool's slate, and must not have started. Both
      // are checked here rather than trusted from the client.
      const [{ data: onSlate }, { data: match }] = await Promise.all([
        admin.from('pool_matches').select('match_id').eq('pool_id', id).eq('match_id', matchId).maybeSingle(),
        admin.from('matches').select('commence_time').eq('id', matchId).maybeSingle(),
      ]);
      if (!onSlate || !match) return fail('That game is not in this pool');
      if (isLocked(match.commence_time as string)) return fail('That game has started', 409);

      const { error } = await admin.from('pool_picks').upsert(
        { pool_id: id, user_id: me, match_id: matchId, pick_side: side, picked_at: new Date().toISOString() },
        { onConflict: 'pool_id,user_id,match_id' },
      );
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
    }

    default:
      return fail('Unknown action');
  }
}

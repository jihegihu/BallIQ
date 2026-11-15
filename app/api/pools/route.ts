// Head-to-head pools.
//
//   GET  /api/pools                                  — pools I am in or invited to
//   POST /api/pools  { sport, key, nights, invite }  — start one
//
// Slates are never taken from the client. The request names a slate (a week,
// or an NBA night) and the server rebuilds the game list from the schedule, so
// nobody can post a hand-picked set of games.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import {
  isPoolSport, slateOptions, POOL_STAKE, POOL_MIN_SETTLED_PICKS, POOL_MAX_MEMBERS,
} from '@/lib/pools';
import { settledPickCount, loadSlateGames, conflictingPool } from '@/lib/poolsServer';

const MIGRATION_HINT = 'has supabase/migration-009-pools.sql been run?';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const me    = await getOrCreateUser(clerkId);

  const [{ data: mine, error }, settled] = await Promise.all([
    admin.from('pool_members')
      .select('pool_id, status, correct, elo_delta')
      .eq('user_id', me)
      .in('status', ['invited', 'joined']),
    settledPickCount(admin, me),
  ]);
  if (error) return NextResponse.json({ error: error.message, hint: MIGRATION_HINT }, { status: 500 });

  const eligible = {
    ok: settled >= POOL_MIN_SETTLED_PICKS,
    settled,
    needed: POOL_MIN_SETTLED_PICKS,
  };

  const myRows = new Map((mine ?? []).map((r) => [r.pool_id as string, r]));
  const ids = [...myRows.keys()];
  if (ids.length === 0) return NextResponse.json({ eligible, pools: [] });

  const [{ data: poolRows }, { data: memberRows }, { data: slateRows }, { data: pickRows }] = await Promise.all([
    admin.from('pools')
      .select('id, creator_id, sport, title, stake, status, locks_at, ends_at, settled_at, created_at')
      .in('id', ids)
      .order('created_at', { ascending: false })
      .limit(60),
    admin.from('pool_members').select('pool_id, status').in('pool_id', ids),
    admin.from('pool_matches').select('pool_id').in('pool_id', ids),
    admin.from('pool_picks').select('pool_id').eq('user_id', me).in('pool_id', ids),
  ]);

  const count = (rows: { pool_id: unknown }[] | null, id: string) =>
    (rows ?? []).filter((r) => r.pool_id === id).length;

  const creatorIds = [...new Set((poolRows ?? []).map((p) => p.creator_id as string))];
  const { data: creators } = creatorIds.length > 0
    ? await admin.from('users').select('id, username').in('id', creatorIds)
    : { data: [] };
  const names = new Map((creators ?? []).map((u) => [u.id as string, u.username as string]));

  const now = Date.now();
  const pools = (poolRows ?? [])
    .map((p) => {
      const id = p.id as string;
      const my = myRows.get(id)!;
      const locked = new Date(p.locks_at as string).getTime() <= now;
      const phase =
        p.status === 'settled'   ? 'settled' :
        p.status === 'cancelled' ? 'cancelled' :
        locked                   ? 'live' : 'open';
      return {
        id,
        sport: p.sport, title: p.title, stake: p.stake,
        phase,
        locksAt: p.locks_at, endsAt: p.ends_at,
        creatorId: p.creator_id,
        creatorName: names.get(p.creator_id as string) ?? 'Player',
        joined: (memberRows ?? []).filter((m) => m.pool_id === id && m.status === 'joined').length,
        games: count(slateRows, id),
        myStatus: my.status,
        myPicks: count(pickRows, id),
        myCorrect: my.correct ?? null,
        myDelta: my.elo_delta ?? null,
      };
    })
    // An invitation that can no longer be accepted is just clutter.
    .filter((p) => !(p.myStatus === 'invited' && p.phase !== 'open'));

  return NextResponse.json({ eligible, pools });
}

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    sport?: unknown; key?: unknown; nights?: unknown; invite?: unknown;
  };
  if (!isPoolSport(body.sport)) return NextResponse.json({ error: 'Pick a sport' }, { status: 400 });
  const sport  = body.sport;
  const nights = body.nights === 2 ? 2 : 1;
  const invite = Array.isArray(body.invite)
    ? [...new Set(body.invite.filter((x): x is string => typeof x === 'string'))]
    : [];

  const admin = createAdminClient();
  const me    = await getOrCreateUser(clerkId);

  const settled = await settledPickCount(admin, me);
  if (settled < POOL_MIN_SETTLED_PICKS) {
    return NextResponse.json({
      error: `You need ${POOL_MIN_SETTLED_PICKS} settled picks to play head to head. You have ${settled}.`,
    }, { status: 403 });
  }

  // Rebuilt from the schedule, never trusted from the request.
  const slate = slateOptions(sport, await loadSlateGames(admin, sport))
    .find((o) => o.key === body.key && o.nights === nights);
  if (!slate) return NextResponse.json({ error: 'That slate is no longer available' }, { status: 409 });

  if (await conflictingPool(admin, me, sport, slate.weekKey)) {
    return NextResponse.json({ error: `You are already in a ${sport} pool this week` }, { status: 409 });
  }

  // Invitations go only to people the creator follows, so a pool cannot be
  // used to push invites at strangers.
  const { data: followRows } = invite.length > 0
    ? await admin.from('follows').select('followee_id').eq('follower_id', me).in('followee_id', invite)
    : { data: [] };
  const invitees = (followRows ?? [])
    .map((f) => f.followee_id as string)
    .filter((id) => id !== me)
    .slice(0, POOL_MAX_MEMBERS * 2);

  const { data: created, error } = await admin.from('pools').insert({
    creator_id: me,
    sport,
    title: `${sport} · ${slate.label}`,
    week_key: slate.weekKey,
    stake: POOL_STAKE,
    locks_at: slate.locksAt,
    ends_at: slate.endsAt,
  }).select('id').single();
  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? 'Could not create pool', hint: MIGRATION_HINT }, { status: 500 });
  }
  const poolId = created.id as string;

  const nowIso = new Date().toISOString();
  const [{ error: slateErr }, { error: memberErr }] = await Promise.all([
    admin.from('pool_matches').insert(slate.games.map((g) => ({ pool_id: poolId, match_id: g.id }))),
    admin.from('pool_members').insert([
      { pool_id: poolId, user_id: me, status: 'joined', joined_at: nowIso },
      ...invitees.map((id) => ({ pool_id: poolId, user_id: id, status: 'invited', invited_by: me })),
    ]),
  ]);

  // A pool without its slate or its creator is unusable. Remove it rather
  // than leave a husk that would sit in someone's list forever.
  if (slateErr || memberErr) {
    await admin.from('pools').delete().eq('id', poolId);
    return NextResponse.json({ error: (slateErr ?? memberErr)!.message }, { status: 500 });
  }

  return NextResponse.json({ id: poolId });
}

// Head-to-head pools: the database half. Server-side only.
//
// The rules themselves are pure functions in lib/pools.ts. Everything here is
// reading the rows those rules need and writing down what they decide.
//
// Every function tolerates the pool tables not existing yet. The feature ships
// in code before migration-009 is run by hand, and the odds sync calls into
// this file on every tick — a missing table must read as "no pools", never as
// a failed sync.

import { createAdminClient } from './supabase';
import { ELO_FLOOR } from './elo';
import {
  computePayouts, resultOf, POOL_MIN_MEMBERS, POOL_SETTLE_GRACE_HOURS,
  type MatchResultRow, type PoolSide, type SlateGame, type Standing,
} from './pools';

type Admin = ReturnType<typeof createAdminClient>;

/** Picks that have actually been graded — what "20 settled picks" counts. */
export async function settledPickCount(admin: Admin, userId: string): Promise<number> {
  const { count } = await admin
    .from('user_picks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('outcome', ['win', 'loss', 'push']);
  return count ?? 0;
}

/** Upcoming games for one sport, in the shape the slate builder wants. */
export async function loadSlateGames(admin: Admin, sport: string): Promise<SlateGame[]> {
  const { data } = await admin
    .from('matches')
    .select('id, sport, home_team, away_team, commence_time')
    .eq('sport', sport)
    .gt('commence_time', new Date().toISOString())
    .order('commence_time', { ascending: true })
    .limit(400);
  return (data ?? []) as SlateGame[];
}

/**
 * The pool, if any, that already uses up this player's one slot for a sport
 * and week. Cancelled pools do not count; a pool they were only invited to
 * does not count either.
 */
export async function conflictingPool(
  admin: Admin,
  userId: string,
  sport: string,
  weekKey: string,
  exceptPoolId?: string,
): Promise<string | null> {
  const { data: mine } = await admin
    .from('pool_members')
    .select('pool_id')
    .eq('user_id', userId)
    .eq('status', 'joined');
  const ids = (mine ?? []).map((r) => r.pool_id as string).filter((id) => id !== exceptPoolId);
  if (ids.length === 0) return null;

  const { data: clash } = await admin
    .from('pools')
    .select('id')
    .in('id', ids)
    .eq('sport', sport)
    .eq('week_key', weekKey)
    .neq('status', 'cancelled')
    .limit(1);
  return (clash?.[0]?.id as string | undefined) ?? null;
}

/**
 * Sports that have a locked, unsettled pool waiting on results.
 *
 * The odds sync only fetches scores for sports with pending picks. A pool's
 * games normally have those anyway, but settlement should not depend on it,
 * so the sync folds these in.
 */
export async function poolSportsAwaitingResults(admin: Admin): Promise<string[]> {
  const { data, error } = await admin
    .from('pools')
    .select('sport')
    .eq('status', 'open')
    .lte('locks_at', new Date().toISOString());
  if (error) return [];
  return [...new Set((data ?? []).map((r) => r.sport as string))];
}

export type SettleSummary = { settled: number; cancelled: number; waiting: number; error?: string };

/**
 * Settle every pool whose slate has finished, and cancel any that locked with
 * too few players.
 *
 * A pool is claimed (flipped to 'settled') BEFORE any rating moves, with the
 * update conditional on it still being open. Two overlapping sync runs can
 * therefore never both pay out. The cost of that ordering is that a crash
 * between the claim and the last rating write leaves someone unpaid — the
 * amounts are recorded on pool_members first, so that is repairable, whereas
 * paying a pot out twice is not.
 */
export async function settleDuePools(admin: Admin, now = new Date()): Promise<SettleSummary> {
  const summary: SettleSummary = { settled: 0, cancelled: 0, waiting: 0 };
  const nowIso = now.toISOString();

  const { data: due, error } = await admin
    .from('pools')
    .select('id, sport, stake, ends_at')
    .eq('status', 'open')
    .lte('locks_at', nowIso);
  if (error) return { ...summary, error: error.message };

  for (const pool of due ?? []) {
    const poolId = pool.id as string;

    const cancel = async () => {
      const { data: done } = await admin
        .from('pools')
        .update({ status: 'cancelled', settled_at: nowIso })
        .eq('id', poolId).eq('status', 'open')
        .select('id');
      if (done && done.length > 0) summary.cancelled++;
    };

    const { data: memberRows } = await admin
      .from('pool_members')
      .select('user_id')
      .eq('pool_id', poolId)
      .eq('status', 'joined');
    const memberIds = (memberRows ?? []).map((m) => m.user_id as string);

    // Locked with nobody to play against: no contest, nothing moves.
    if (memberIds.length < POOL_MIN_MEMBERS) { await cancel(); continue; }

    const { data: slate } = await admin.from('pool_matches').select('match_id').eq('pool_id', poolId);
    const matchIds = (slate ?? []).map((s) => s.match_id as string);

    const { data: matchRows } = matchIds.length > 0
      ? await admin
          .from('matches')
          .select('id, status, home_score, away_score, result_winner')
          .in('id', matchIds)
      : { data: [] };

    const results = new Map<string, PoolSide>();
    for (const m of matchRows ?? []) {
      const r = resultOf(m as unknown as MatchResultRow);
      if (r) results.set(m.id as string, r);
    }

    const undecided = matchIds.length - results.size;
    const graceEnds = new Date(pool.ends_at as string).getTime() + POOL_SETTLE_GRACE_HOURS * 3_600_000;
    if (undecided > 0 && now.getTime() < graceEnds) { summary.waiting++; continue; }

    // Past the grace period with nothing at all decided: call it off rather
    // than "settle" a contest in which no game ever finished.
    if (results.size === 0) { await cancel(); continue; }

    const { data: pickRows } = await admin
      .from('pool_picks')
      .select('user_id, match_id, pick_side')
      .eq('pool_id', poolId);

    const correct = new Map<string, number>(memberIds.map((id) => [id, 0]));
    for (const p of pickRows ?? []) {
      const uid = p.user_id as string;
      if (!correct.has(uid)) continue;                       // left before lock
      if (results.get(p.match_id as string) === p.pick_side) correct.set(uid, correct.get(uid)! + 1);
    }

    const { data: userRows } = await admin
      .from('users')
      .select('id, global_elo, season_elo')
      .in('id', memberIds);
    const users = new Map((userRows ?? []).map((u) => [u.id as string, u]));

    const standings: Standing[] = memberIds
      .filter((id) => users.has(id))
      .map((id) => ({ userId: id, elo: users.get(id)!.global_elo as number, correct: correct.get(id) ?? 0 }));

    const payouts = computePayouts(standings, pool.stake as number);

    // Claim first. If another run already settled it, stop here.
    const { data: claimed } = await admin
      .from('pools')
      .update({ status: 'settled', settled_at: nowIso })
      .eq('id', poolId).eq('status', 'open')
      .select('id');
    if (!claimed || claimed.length === 0) continue;

    for (const s of standings) {
      const delta = payouts.get(s.userId) ?? 0;
      await admin
        .from('pool_members')
        .update({ correct: s.correct, elo_delta: delta })
        .eq('pool_id', poolId).eq('user_id', s.userId);

      if (delta === 0) continue;
      const u = users.get(s.userId)!;
      await admin.from('users').update({
        global_elo: Math.max(ELO_FLOOR, (u.global_elo as number) + delta),
        season_elo: Math.max(ELO_FLOOR, (u.season_elo as number) + delta),
      }).eq('id', s.userId);
    }
    summary.settled++;
  }

  return summary;
}

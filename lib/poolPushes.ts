// Push notifications for head-to-head pools: "you were invited" and "it is
// final". Server-side only; called from the hourly /api/notify job.
//
// Sent from that job rather than at the moment something happens, for one
// reason: settlement runs whenever the last game of a slate is graded, which
// for a Monday night game is after 1am Eastern. Nobody should be woken by a
// pool result. Here each device is checked against its own local clock, so the
// worst case is an invite arriving up to an hour late — and never at night.
//
// Each notification is claimed by stamping its row (invite_notified_at /
// result_notified_at) with the update conditional on the stamp still being
// empty, so two overlapping runs cannot both send it.

import { createAdminClient } from './supabase';
import { sendApnsPush } from './apns';
import { localClock } from './notifyWindow';
import { poolInviteMessage, poolResultMessage } from './notifyCopy';

type Admin = ReturnType<typeof createAdminClient>;
type TokenRow = { token: string; user_id: string; timezone: string | null };

/** Local hours (inclusive) in which a pool push may be delivered. */
const AWAKE_FROM = 9;
const AWAKE_TO = 21;

/** Results older than this are history, not news. */
const RESULT_MAX_AGE_HOURS = 48;

export type PoolPushSummary = { invites: number; results: number; dead: string[] };

export async function sendPoolPushes(
  admin: Admin,
  tokens: TokenRow[],
  enabledUserIds: Set<string>,
  now = new Date(),
): Promise<PoolPushSummary> {
  const summary: PoolPushSummary = { invites: 0, results: 0, dead: [] };

  // Devices that belong to someone who wants notifications and is awake.
  const awake = new Map<string, string[]>();
  for (const t of tokens) {
    if (!enabledUserIds.has(t.user_id)) continue;
    const { hour } = localClock(t.timezone, now);
    if (hour < AWAKE_FROM || hour > AWAKE_TO) continue;
    awake.set(t.user_id, [...(awake.get(t.user_id) ?? []), t.token]);
  }
  if (awake.size === 0) return summary;
  const awakeIds = [...awake.keys()];
  const nowIso = now.toISOString();

  // ── Invitations ─────────────────────────────────────────────────────────────
  const { data: inviteRows, error: inviteErr } = await admin
    .from('pool_members')
    .select('pool_id, user_id, invited_by, pools(title, stake, status, locks_at)')
    .eq('status', 'invited')
    .is('invite_notified_at', null)
    .in('user_id', awakeIds);
  // The tables do not exist until migration-009 is run. That is "no pools".
  if (inviteErr) return summary;

  const inviterIds = [...new Set((inviteRows ?? []).map((r) => r.invited_by as string).filter(Boolean))];
  const { data: inviters } = inviterIds.length > 0
    ? await admin.from('users').select('id, username').in('id', inviterIds)
    : { data: [] };
  const names = new Map((inviters ?? []).map((u) => [u.id as string, u.username as string]));

  for (const r of inviteRows ?? []) {
    const pool = r.pools as unknown as { title: string; stake: number; status: string; locks_at: string } | null;
    // An invite to a pool that has locked or been cancelled cannot be acted on.
    if (!pool || pool.status !== 'open' || new Date(pool.locks_at).getTime() <= now.getTime()) continue;

    const { data: claimed } = await admin
      .from('pool_members')
      .update({ invite_notified_at: nowIso })
      .eq('pool_id', r.pool_id).eq('user_id', r.user_id)
      .is('invite_notified_at', null)
      .select('user_id');
    if (!claimed || claimed.length === 0) continue;

    const res = await sendApnsPush(awake.get(r.user_id as string) ?? [], {
      ...poolInviteMessage({
        from: names.get(r.invited_by as string) ?? 'A friend',
        title: pool.title,
        stake: pool.stake,
      }),
      data: { kind: 'pool_invite', poolId: r.pool_id },
    });
    summary.dead.push(...res.invalidTokens);
    summary.invites++;
  }

  // ── Results ─────────────────────────────────────────────────────────────────
  const { data: resultRows } = await admin
    .from('pool_members')
    .select('pool_id, user_id, correct, elo_delta, pools(title, status, settled_at)')
    .eq('status', 'joined')
    .is('result_notified_at', null)
    .not('elo_delta', 'is', null)
    .in('user_id', awakeIds);

  const oldest = now.getTime() - RESULT_MAX_AGE_HOURS * 3_600_000;
  for (const r of resultRows ?? []) {
    const pool = r.pools as unknown as { title: string; status: string; settled_at: string | null } | null;
    if (!pool || pool.status !== 'settled' || !pool.settled_at) continue;
    if (new Date(pool.settled_at).getTime() < oldest) continue;

    const { data: claimed } = await admin
      .from('pool_members')
      .update({ result_notified_at: nowIso })
      .eq('pool_id', r.pool_id).eq('user_id', r.user_id)
      .is('result_notified_at', null)
      .select('user_id');
    if (!claimed || claimed.length === 0) continue;

    const res = await sendApnsPush(awake.get(r.user_id as string) ?? [], {
      ...poolResultMessage({
        title: pool.title,
        delta: r.elo_delta as number,
        correct: (r.correct as number | null) ?? 0,
      }),
      data: { kind: 'pool_result', poolId: r.pool_id },
    });
    summary.dead.push(...res.invalidTokens);
    summary.results++;
  }

  return summary;
}

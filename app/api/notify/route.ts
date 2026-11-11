// GET /api/notify — scheduled trigger only. Sends the two daily pushes.
//
// Requires `Authorization: Bearer {CRON_SECRET}` or `x-cron-secret`, same as
// /api/sync-odds. Run it HOURLY: it does nothing on most ticks and only acts
// for devices whose LOCAL clock has reached a slot (lib/notifyWindow.ts), which
// is how one UTC schedule serves every timezone.
//
// Spends ZERO Odds API credits — it only reads Supabase and talks to APNs, so
// running it 24x/day costs nothing against the odds plan.
//
// Two sends, at most one of each per user per local day:
//
//   big_game      ~6pm local   one unpicked game worth deciding on
//   daily_digest  ~11pm local  how today went + where you now rank
//
// The settlement push used to fire from sync-odds on every run, up to 16 times
// a day. That is gone; the digest replaces it. Volume is the feature here.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { checkCronAuth } from '@/lib/cronAuth';
import { sendApnsPush } from '@/lib/apns';
import { dueKinds, SETTLED_GAP_HOURS, type NotifyKind } from '@/lib/notifyWindow';
import { scoreGames, matchupLabel, type ScorableGame } from '@/lib/bigGame';
import { bigGameMessage, digestMessage, settledMessage } from '@/lib/notifyCopy';
import { isLocked } from '@/lib/lock';
import { summarizeRecord } from '@/lib/record';
import {
  calculateEloDelta, getKFactor, impliedProbToEventElo,
  americanOddsToImpliedProb, removeVig, START_ELO,
} from '@/lib/elo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** How far ahead the evening nudge looks for a game. */
const REMINDER_HORIZON_HOURS = 18;

type TokenRow = { token: string; user_id: string; timezone: string | null };

export async function GET(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const now = new Date();

  // ── Who could receive anything at all ───────────────────────────────────────
  const { data: tokenRows, error: tokenErr } = await admin
    .from('push_tokens')
    .select('token, user_id, timezone');

  // Surfaced rather than swallowed. Before migration 007 runs there is no
  // `timezone` column, so this query fails and an `?? []` would report "no
  // registered devices" — a green response that looks like a working cron
  // while nothing can ever send.
  if (tokenErr) {
    return NextResponse.json(
      { ok: false, error: tokenErr.message, hint: 'has supabase/migration-007-notifications.sql been run?' },
      { status: 500 },
    );
  }

  const tokens = (tokenRows ?? []) as TokenRow[];
  if (tokens.length === 0) {
    return NextResponse.json({ ok: true, reason: 'no registered devices' });
  }

  // The master switch, honoured here rather than at send time so an opted-out
  // user costs us no further queries.
  // total_picks / weeks_active come along because the big-game nudge quotes
  // the Elo this user would actually win, which needs their K factor.
  const { data: userRows } = await admin
    .from('users')
    .select('id, username, global_elo, total_picks, weeks_active, notifications_enabled')
    .in('id', [...new Set(tokens.map((t) => t.user_id))]);

  const enabled = new Map(
    (userRows ?? [])
      .filter((u) => u.notifications_enabled !== false)
      .map((u) => [u.id as string, u]),
  );

  // ── Group devices by (user, local day, due slot) ────────────────────────────
  // Keyed per user rather than per token: two phones in different timezones
  // both get it, but the once-per-day ledger is per account, so whichever
  // device's clock reaches the slot first claims the day for that account.
  type Job = {
    userId: string; kind: NotifyKind; localDay: string; slot: number;
    zone: string; tokens: string[];
  };
  const jobs = new Map<string, Job>();

  for (const t of tokens) {
    if (!enabled.has(t.user_id)) continue;
    // `zone` is carried so kick-off times are written in the clock the reader
    // is holding, not the server's.
    const { day, due, zone } = dueKinds(t.timezone, now);
    for (const { kind, slot } of due) {
      const key = `${t.user_id}|${kind}|${day}|${slot}`;
      const existing = jobs.get(key);
      if (existing) existing.tokens.push(t.token);
      else jobs.set(key, { userId: t.user_id, kind, localDay: day, slot, zone, tokens: [t.token] });
    }
  }

  if (jobs.size === 0) {
    return NextResponse.json({ ok: true, reason: 'no device is inside a send window' });
  }

  // ── Claim each slot BEFORE sending ──────────────────────────────────────────
  // Insert-first, send-after. The primary key makes a duplicate insert fail,
  // so two overlapping cron runs cannot both send. The cost of this ordering is
  // that a crash between insert and send silently skips a notification; the
  // cost of the reverse would be sending twice, which users notice and
  // uninstall over. Skipping is the better failure.
  const claimed: Job[] = [];
  for (const job of jobs.values()) {
    const { error } = await admin.from('notification_log').insert({
      user_id: job.userId, kind: job.kind, local_day: job.localDay, slot: job.slot,
    });
    if (!error) claimed.push(job);
  }

  if (claimed.length === 0) {
    return NextResponse.json({ ok: true, reason: 'every due slot is already claimed' });
  }

  const dead: string[] = [];
  let sentBigGame = 0, sentDigest = 0, sentSettled = 0, skipped = 0;

  // ── big_game: one unpicked game worth deciding on ───────────────────────────
  const bigGameJobs = claimed.filter((j) => j.kind === 'big_game');
  if (bigGameJobs.length > 0) {
    const horizon = new Date(now.getTime() + REMINDER_HORIZON_HOURS * 3600_000);
    const { data: gameRows } = await admin
      .from('matches')
      .select('id, sport, home_team, away_team, commence_time, moneyline_home, moneyline_away, broadcast')
      .gt('commence_time', now.toISOString())
      .lt('commence_time', horizon.toISOString())
      .order('commence_time', { ascending: true });

    // Still pickable: a game inside the lock window is no use as a nudge.
    const open = ((gameRows ?? []) as ScorableGame[])
      .filter((g) => !isLocked(g.commence_time));

    // Social proof, and also what lets us skip games the user already has.
    const { data: pickRows } = open.length > 0
      ? await admin
          .from('user_picks')
          .select('user_id, match_id')
          .in('match_id', open.map((g) => g.id))
      : { data: [] };

    const counts = new Map<string, number>();
    const mine = new Map<string, Set<string>>();
    for (const p of pickRows ?? []) {
      const mid = p.match_id as string, uid = p.user_id as string;
      counts.set(mid, (counts.get(mid) ?? 0) + 1);
      if (!mine.has(uid)) mine.set(uid, new Set());
      mine.get(uid)!.add(mid);
    }

    const ranked = scoreGames(open, counts);

    for (const job of bigGameJobs) {
      const already = mine.get(job.userId) ?? new Set<string>();
      const top = ranked.find((r) => !already.has(r.game.id));
      // Nothing worth sending: no open game, or they have picked them all.
      // Release the claim — the window spans 17:00-19:59 and an 18h horizon
      // slides forward, so a later tick today may well find one. Holding the
      // claim here silently cost the user the whole day's nudge.
      if (!top) { await release(admin, job); skipped++; continue; }

      // What this pick is worth at best, for THIS user's rating and K. Both
      // sides are priced and the larger taken: the underdog always pays more,
      // and "up to" states that without printing the odds.
      const u = enabled.get(job.userId);
      const elo = (u?.global_elo as number) ?? START_ELO;
      const k = getKFactor((u?.total_picks as number) ?? 0, (u?.weeks_active as number) ?? 1);
      const { probA, probB } = removeVig(
        americanOddsToImpliedProb(top.game.moneyline_home as number),
        americanOddsToImpliedProb(top.game.moneyline_away as number),
      );
      const gainFor = (p: number) => calculateEloDelta({
        userElo: elo,
        eventElo: impliedProbToEventElo(p),
        kFactor: k,
        confidenceLevel: 'medium',
        betType: 'moneyline',
        outcome: 'win',
      }).projectedGain;
      const maxGain = Math.max(gainFor(probA), gainFor(probB));

      const msg = bigGameMessage({
        matchup: matchupLabel(top.game),
        maxGain,
        commenceTime: top.game.commence_time,
        zone: job.zone,
        now,
      });

      const res = await sendApnsPush(job.tokens, {
        ...msg,
        data: { kind: 'big_game', matchId: top.game.id },
      });
      dead.push(...res.invalidTokens);
      sentBigGame++;
    }
  }

  // ── settled: results, while they are still news ─────────────────────────────
  // The 3-hour bucket in the ledger key is what throttles this; by the time we
  // are here the slot is already won, so all that remains is "has anything
  // actually settled since last time".
  const settledJobs = claimed.filter((j) => j.kind === 'settled');
  if (settledJobs.length > 0) {
    const prior = await priorSends(admin, 'settled', settledJobs.map((j) => j.userId));

    for (const job of settledJobs) {
      // Falls back to the gap rather than the whole day: on the first send of
      // a day this must not sweep up last night's results and present them as
      // if they just happened.
      const since = previousSend(prior, job.userId)
        ?? new Date(now.getTime() - SETTLED_GAP_HOURS * 3600_000).toISOString();

      const { data: settled } = await admin
        .from('user_picks')
        .select('outcome, elo_delta')
        .eq('user_id', job.userId)
        .neq('outcome', 'pending')
        .gt('resolved_at', since);

      const rows = settled ?? [];
      if (rows.length === 0) { await release(admin, job); skipped++; continue; }

      const net = rows.reduce((s, p) => s + ((p.elo_delta as number) ?? 0), 0);
      const { wins, losses, pushes } = summarizeRecord(rows.map((p) => p.outcome as string));

      // Everything in the batch was a push: no rating moved, so there is
      // nothing worth interrupting anyone for.
      if (wins + losses === 0) { await release(admin, job); skipped++; continue; }

      const res = await sendApnsPush(job.tokens, {
        ...settledMessage({ wins, losses, pushes, net }),
        data: { kind: 'settled' },
      });
      dead.push(...res.invalidTokens);
      sentSettled++;
    }
  }

  // ── daily_digest: how today went, and where you now rank ────────────────────
  const digestJobs = claimed.filter((j) => j.kind === 'daily_digest');
  if (digestJobs.length > 0) {
    // Watermark off the PREVIOUS digest rather than "since midnight". A game
    // that tips at 10:30pm settles after the digest has gone, and a
    // calendar-day window would never mention it at all; this way it simply
    // lands in tomorrow's.
    const prior = await priorSends(admin, 'daily_digest', digestJobs.map((j) => j.userId));
    const rank = await currentRanks(admin);

    for (const job of digestJobs) {
      const since = previousSend(prior, job.userId) ?? new Date(now.getTime() - 86_400_000).toISOString();

      const { data: settled } = await admin
        .from('user_picks')
        .select('outcome, elo_delta, resolved_at')
        .eq('user_id', job.userId)
        .neq('outcome', 'pending')
        .gt('resolved_at', since);

      const rows = settled ?? [];
      const net = rows.reduce((s, p) => s + ((p.elo_delta as number) ?? 0), 0);
      const { wins, losses } = summarizeRecord(rows.map((p) => p.outcome as string));

      const me = rank.get(job.userId);
      const movement = await rankMovement(admin, job.userId, me?.rank ?? null, job.localDay);

      // Nothing settled and no rank change — say nothing rather than send an
      // empty "0W-0L" that trains people to ignore the app.
      if (rows.length === 0 && !movement.moved) {
        await release(admin, job);
        skipped++;
        continue;
      }

      const msg = digestMessage({
        wins, losses, net,
        rank: me?.rank ?? null,
        prevRank: movement.prevRank,
        settledCount: rows.length,
      });

      const res = await sendApnsPush(job.tokens, {
        ...msg,
        data: { kind: 'daily_digest' },
      });
      dead.push(...res.invalidTokens);
      sentDigest++;
    }
  }

  if (dead.length > 0) await admin.from('push_tokens').delete().in('token', dead);

  return NextResponse.json({
    ok: true,
    due: jobs.size,
    claimed: claimed.length,
    sentBigGame,
    sentSettled,
    sentDigest,
    skipped,
    prunedTokens: dead.length,
  });
}

/**
 * Give a claimed slot back, so a later tick inside the same window can try
 * again. Claiming before sending is what stops a double-send; this is the
 * other half of it — without a release, "nothing to say right now" becomes
 * "nothing to say all day".
 */
async function release(
  admin: Admin,
  job: { userId: string; kind: NotifyKind; localDay: string; slot: number },
) {
  await admin.from('notification_log')
    .delete()
    .eq('user_id', job.userId)
    .eq('kind', job.kind)
    .eq('local_day', job.localDay)
    // Matching the slot matters: 'settled' has several rows per day, and
    // without this, releasing one empty bucket would delete the claims of
    // buckets that had already sent — and let them all fire again.
    .eq('slot', job.slot);
}

type SentRow = { user_id: string; sent_at: string };

/** Ledger rows for a kind, newest first — includes this run's own claims. */
async function priorSends(admin: Admin, kind: NotifyKind, userIds: string[]): Promise<SentRow[]> {
  const { data } = await admin
    .from('notification_log')
    .select('user_id, sent_at')
    .eq('kind', kind)
    .in('user_id', userIds)
    .order('sent_at', { ascending: false });
  return (data ?? []) as SentRow[];
}

/**
 * Second-newest timestamp for a user — the send before this run's claim.
 *
 * The claim is inserted before any of this runs, so the newest row is always
 * our own; the one behind it is the real watermark.
 */
function previousSend(rows: SentRow[], userId: string): string | null {
  const mine = rows.filter((r) => r.user_id === userId);
  return mine.length >= 2 ? mine[1].sent_at : null;
}

type Admin = ReturnType<typeof createAdminClient>;

/** Live global standing, rated accounts only — same gate as the leaderboard. */
async function currentRanks(admin: Admin): Promise<Map<string, { rank: number; elo: number }>> {
  const { data } = await admin
    .from('users')
    .select('id, global_elo')
    .gt('total_picks', 0)
    .order('global_elo', { ascending: false });

  const out = new Map<string, { rank: number; elo: number }>();
  (data ?? []).forEach((u, i) => out.set(u.id as string, { rank: i + 1, elo: u.global_elo as number }));
  return out;
}

/**
 * A phrase describing the move since the last snapshot, or null if there is
 * nothing to say. Also writes today's snapshot, since rank cannot be
 * reconstructed later: it depends on everyone else's rating at the time.
 */
async function rankMovement(
  admin: Admin,
  userId: string,
  rank: number | null,
  day: string,
): Promise<{ prevRank: number | null; moved: boolean }> {
  if (rank == null) return { prevRank: null, moved: false };

  const { data: prev } = await admin
    .from('rank_snapshots')
    .select('rank, day')
    .eq('user_id', userId)
    .lt('day', day)
    .order('day', { ascending: false })
    .limit(1);

  const before = (prev?.[0]?.rank as number | undefined) ?? null;

  const { data: elo } = await admin.from('users').select('global_elo').eq('id', userId).single();
  await admin.from('rank_snapshots').upsert(
    { user_id: userId, day, rank, elo: (elo?.global_elo as number) ?? 0 },
    { onConflict: 'user_id,day' },
  );

  // Returns the raw previous rank rather than a phrase: wording belongs in
  // lib/notifyCopy.ts, where it can be read and tested without a database.
  return { prevRank: before, moved: before != null && before !== rank };
}

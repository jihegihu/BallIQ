// The arithmetic behind the creator's stats screen, as a pure function.
//
// Kept apart from the route that loads the rows so the figures can be checked
// against real data without signing in — retention in particular is easy to
// get subtly wrong (who is old enough to count, which day is "the next day").

import { etDay } from './xp';
import { shiftDay } from './pools';

export type StatsUser  = { id: string; clerk_id: string; created_at: string; total_picks: number };
export type StatsPick  = { user_id: string; placed_at: string };
export type StatsEvent = { user_id: string; name: string; props: Record<string, unknown> | null; created_at: string };

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);

/**
 * `picks` and `events` should cover the last 30 days; `users` is everyone.
 * Days are US Eastern throughout, matching how the rest of the app counts a day.
 */
export function computeStats(users: StatsUser[], picks: StatsPick[], events: StatsEvent[], now = new Date()) {
  const today = etDay(now);
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  // The house bot is not a person.
  const people = users.filter((u) => u.clerk_id !== 'bot_baseline');
  const isPerson = new Set(people.map((u) => u.id));

  // ── Activity: a day counts if they placed a pick or did anything tracked ───
  const activeDays = new Map<string, Set<string>>();          // user → days
  const note = (uid: string, iso: string) => {
    if (!isPerson.has(uid)) return;
    if (!activeDays.has(uid)) activeDays.set(uid, new Set());
    activeDays.get(uid)!.add(etDay(iso));
  };
  const pickCount = new Map<string, number>();
  for (const p of picks) {
    note(p.user_id, p.placed_at);
    pickCount.set(p.user_id, (pickCount.get(p.user_id) ?? 0) + 1);
  }
  for (const e of events) note(e.user_id, e.created_at);

  // ── Last 14 days, day by day ───────────────────────────────────────────────
  const days = Array.from({ length: 14 }, (_, i) => shiftDay(today, i - 13));
  const daily = days.map((day) => ({
    day,
    signups: people.filter((u) => etDay(u.created_at) === day).length,
    active:  [...activeDays.values()].filter((set) => set.has(day)).length,
  }));

  // ── New accounts in the last 30 days: did they start playing? ──────────────
  const fresh = people.filter((u) => u.created_at >= since);
  const picked1 = fresh.filter((u) => (pickCount.get(u.id) ?? 0) >= 1).length;
  const picked3 = fresh.filter((u) => (pickCount.get(u.id) ?? 0) >= 3).length;

  // ── Did they come back? ────────────────────────────────────────────────────
  // Only accounts old enough for the question to have an answer are counted.
  // Someone who signed up yesterday has not had a "next day" yet, and counting
  // them as not-returned would drag the figure down for no reason.
  const signupDay = (u: StatsUser) => etDay(u.created_at);
  const oldEnough1 = fresh.filter((u) => signupDay(u) <= shiftDay(today, -2));
  const oldEnough7 = fresh.filter((u) => signupDay(u) <= shiftDay(today, -8));
  const backNextDay = oldEnough1.filter((u) => activeDays.get(u.id)?.has(shiftDay(signupDay(u), 1))).length;
  const backInWeek  = oldEnough7.filter((u) => {
    const set = activeDays.get(u.id);
    return !!set && [2, 3, 4, 5, 6, 7].some((d) => set.has(shiftDay(signupDay(u), d)));
  }).length;

  // ── Onboarding funnel, distinct people ─────────────────────────────────────
  const reached = (name: string, test: (p: Record<string, unknown> | null) => boolean = () => true) =>
    new Set(events.filter((e) => e.name === name && isPerson.has(e.user_id) && test(e.props)).map((e) => e.user_id)).size;
  const step = (s: string) => reached('tour_step', (p) => p?.step === s);
  const funnel = [
    { label: 'Started',           n: reached('tour_started', (p) => p?.replay !== true) },
    { label: 'Chose a sport',     n: step('picks') },
    { label: 'Saw pending picks', n: step('pending') },
    { label: 'Saw results',       n: step('results') },
    { label: 'Saw rankings',      n: step('ranks') },
    { label: 'Saw the ladder',    n: step('climb') },
    { label: 'Saw head to head',  n: step('h2h') },
    { label: 'Finished',          n: reached('tour_finished') },
  ];

  const count = (name: string) => events.filter((e) => e.name === name && isPerson.has(e.user_id)).length;

  return {
    generatedAt: now.toISOString(),
    totals: {
      accounts: people.length,
      withAPick: people.filter((u) => u.total_picks > 0).length,
      activeToday: daily[daily.length - 1].active,
      active7d: [...activeDays.values()].filter((set) => days.slice(-7).some((d) => set.has(d))).length,
    },
    daily,
    newAccounts: {
      count: fresh.length,
      picked1, picked1Pct: pct(picked1, fresh.length),
      picked3, picked3Pct: pct(picked3, fresh.length),
    },
    retention: {
      nextDay: { of: oldEnough1.length, n: backNextDay, pct: pct(backNextDay, oldEnough1.length) },
      week:    { of: oldEnough7.length, n: backInWeek,  pct: pct(backInWeek, oldEnough7.length) },
    },
    funnel,
    skippedPickStep: reached('tour_skipped'),
    sharing: {
      inviteShared:   count('invite_shared'),
      inviteAccepted: count('invite_accepted'),
      cardShared:     count('card_shared'),
    },
  };
}

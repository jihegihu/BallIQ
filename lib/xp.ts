// lib/xp.ts
// Single source of truth for XP earned on pick placement.
// Used by the client store (optimistic) and the picks API (authoritative).

import { BetType, ConfidenceLevel } from '@/types';

export function calculateXP({
  isFirstToday,
  projectedStreak,
  betType,
  confidenceLevel,
}: {
  isFirstToday: boolean;
  projectedStreak: number;
  betType: BetType;
  confidenceLevel: ConfidenceLevel;
}): number {
  let xp = 10;
  if (isFirstToday)               xp += 25;
  if (projectedStreak >= 7)       xp += 50;
  else if (projectedStreak >= 3)  xp += 15;
  if (betType === 'spread')       xp += 5;
  if (confidenceLevel === 'high') xp += 5;
  return xp;
}

// ── Day boundaries ────────────────────────────────────────────────────────────
// Streaks and the once-a-day XP bonus are anchored to US Eastern, NOT UTC.
// With UTC, a user picking at 9pm ET on consecutive evenings lands on the same
// UTC date (02:00 next day) — the streak silently stalls, and "first pick
// today" mis-fires. Eastern matches the sports calendar and the sync cron, and
// both client and server call this so they always agree.
const ET_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Calendar day (YYYY-MM-DD) in US Eastern for an ISO string, Date, or now. */
export function etDay(when: string | Date = new Date()): string {
  const d = typeof when === 'string' ? new Date(when) : when;
  if (Number.isNaN(d.getTime())) return ET_DAY.format(new Date());
  return ET_DAY.format(d);
}

/** Yesterday's Eastern calendar day. */
export function etYesterday(): string {
  return etDay(new Date(Date.now() - 86_400_000));
}

// Streak the user would have after placing a pick right now.
export function projectStreak(lastPickDate: string | null, currentStreak: number): number {
  // last_pick_date may arrive as a full timestamp from the DB — normalise.
  const last = lastPickDate ? lastPickDate.slice(0, 10) : null;
  return (
    last === etDay()       ? currentStreak :
    last === etYesterday() ? currentStreak + 1 :
    1
  );
}

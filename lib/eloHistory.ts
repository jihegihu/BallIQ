// Reconstructs a daily Elo series from settled picks.
//
// We don't store rating snapshots, but every settled pick carries its
// eloDelta — so walking backwards from the user's current rating recovers the
// whole curve exactly.

import { UserPick } from '@/types';
import { etDay } from './xp';

export type EloPoint = { day: string; elo: number };

/**
 * Daily Elo for the last `days` days (oldest → newest), one point per day,
 * carrying the previous value forward on days with no settled picks.
 * Returns [] when there isn't enough history to draw anything meaningful.
 */
export function buildEloHistory(
  picks: UserPick[],
  currentElo: number,
  days = 30,
): EloPoint[] {
  const settled = picks
    .filter((p) => p.eloDelta != null && p.resolvedAt)
    .sort((a, b) => new Date(a.resolvedAt!).getTime() - new Date(b.resolvedAt!).getTime());

  if (settled.length === 0) return [];

  // Rating before the very first settled pick.
  const totalDelta = settled.reduce((s, p) => s + (p.eloDelta ?? 0), 0);
  let running = currentElo - totalDelta;

  // Closing rating for each day that actually had settlements.
  const closeByDay = new Map<string, number>();
  for (const p of settled) {
    running += p.eloDelta ?? 0;
    closeByDay.set(etDay(p.resolvedAt!), running);
  }

  // Rating as of the day before our window opens — the starting level.
  const windowDays: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    windowDays.push(etDay(new Date(Date.now() - i * 86_400_000)));
  }
  const firstDay = windowDays[0];

  let carried = currentElo - totalDelta;
  for (const p of settled) {
    if (etDay(p.resolvedAt!) < firstDay) carried += p.eloDelta ?? 0;
    else break;
  }

  const out: EloPoint[] = [];
  let last = carried;
  for (const day of windowDays) {
    if (closeByDay.has(day)) last = closeByDay.get(day)!;
    out.push({ day, elo: last });
  }

  // A dead-flat line (nothing settled in the window) isn't worth showing.
  return out.some((p) => p.elo !== out[0].elo) ? out : [];
}

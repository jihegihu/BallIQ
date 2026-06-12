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

// Streak the user would have after placing a pick right now.
export function projectStreak(lastPickDate: string | null, currentStreak: number): number {
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  return (
    lastPickDate === today     ? currentStreak :
    lastPickDate === yesterday ? currentStreak + 1 :
    1
  );
}

// Single source of truth for win/loss records and win rate.
//
// This existed in four places that disagreed, which is why the displayed win
// rate never matched the W–L next to it:
//
//   * every copy divided wins by wins+losses+PUSHES, so 5W–3L–2P showed 50%
//     where the record reads 5–3 (63%). A push returns your stake and moves
//     your rating by 0 — by sports convention it is excluded from win rate,
//     exactly as it is excluded from the W–L.
//   * the Elo sheet and account page also counted 'void' picks as settled
//     while the picks page did not, so the two screens disagreed again.
//
// One helper, one definition, used everywhere.

/** Outcomes that represent a real, graded result. */
const SETTLED = new Set(['win', 'loss', 'push']);

export type RecordSummary = {
  wins: number;
  losses: number;
  pushes: number;
  /** Graded picks: wins + losses + pushes. The "N settled picks" figure. */
  settled: number;
  /** Picks that went one way or the other: wins + losses. Win-rate denominator. */
  decided: number;
  /** wins / decided, rounded. null when nothing has been decided yet. */
  winRate: number | null;
};

/**
 * Summarise a list of outcomes. Accepts whatever shape the caller has —
 * client `UserPick.outcome` or a raw snake_case DB row's `outcome` — since it
 * only ever reads the string.
 */
export function summarizeRecord(outcomes: readonly (string | null | undefined)[]): RecordSummary {
  let wins = 0, losses = 0, pushes = 0;
  for (const o of outcomes) {
    if (!o || !SETTLED.has(o)) continue;   // pending / cancelled / void
    if (o === 'win') wins++;
    else if (o === 'loss') losses++;
    else pushes++;
  }
  const decided = wins + losses;
  return {
    wins, losses, pushes,
    settled: decided + pushes,
    decided,
    winRate: decided > 0 ? Math.round((wins / decided) * 100) : null,
  };
}

/** True for picks that count as graded — use to filter before summing Elo. */
export function isSettled(outcome: string | null | undefined): boolean {
  return !!outcome && SETTLED.has(outcome);
}

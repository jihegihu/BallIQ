// lib/elo.ts

import { BetType, ConfidenceLevel, PickOutcome } from '@/types';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const CONFIDENCE_MULTIPLIERS: Record<ConfidenceLevel, number> = {
  low:    0.75,
  medium: 1.00,
  high:   1.50,
};

// ─── STEP 1: Convert American odds to implied probability ─────────────────────
// Example: -165 → 0.623 (62.3% chance of winning per the market)

export function americanOddsToImpliedProb(odds: number): number {
  if (odds < 0) {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  } else {
    return 100 / (odds + 100);
  }
}

// ─── STEP 2: Remove the vig (bookmaker's cut) ─────────────────────────────────
// Raw probs add up to >100% because the book takes a cut.
// We normalize them so they add up to exactly 100%.

export function removeVig(probA: number, probB: number) {
  const total = probA + probB;
  return {
    probA: probA / total,
    probB: probB / total,
  };
}

// ─── STEP 3: Convert implied probability to Event Elo ────────────────────────
// Calibrated so a baseline-1200 user has expectedScore = market probability,
// giving expected Elo change of 0 when winning exactly at the market rate.
//
// Formula: 1200 − 400 × log₁₀(p / (1−p))
//   50% chance  → 1200  (fair fight, equal gain/loss)
//   30% chance  → ~1347 (underdog — big reward if right, small loss if wrong)
//   70% chance  →  ~853 (favorite  — small reward if right, bigger loss if wrong)
//   20% chance  → ~1441 (big underdog)
//   80% chance  →   ~759 (heavy favorite)

export function impliedProbToEventElo(prob: number): number {
  const p      = Math.max(0.01, Math.min(0.99, prob)); // prevent log(0)
  const rawElo = 1200 - 400 * Math.log10(p / (1 - p));
  return Math.max(100, Math.min(2400, Math.round(rawElo)));
}

// ─── STEP 4: K-Factor (how fast Elo moves) ────────────────────────────────────
// New players: fast movement (exciting, bouncy)
// Veterans: slow movement (stable, earned)
// Gated by BOTH pick count AND weeks active to prevent farming

export const ELO_FLOOR = 100;  // ratings never fall below this

export const K_NEW = 64;   // brand-new account: rating moves fast
export const K_VET = 20;   // seasoned account: rating is hard-earned

export function getKFactor(totalPicks: number, weeksActive: number): number {
  // Progress along each axis (0 → 1). Taking the MIN means neither grinding
  // picks nor merely waiting can rush the ramp on its own — the old gate,
  // preserved.
  const pickProgress = Math.min(1, Math.max(0, totalPicks) / 300);
  const weekProgress = Math.min(1, Math.max(0, weeksActive - 1) / 15);
  const t = Math.min(pickProgress, weekProgress);

  // Ease-out so K drops fastest early (when our estimate of the user is
  // worst) and flattens toward the veteran floor. This replaces hard tier
  // cliffs — the old table dropped 64→40 in a single pick, a 37% overnight
  // cut in how much the game reacted to you. The curve still passes through
  // the old anchors (~40 at 100 picks/6 weeks, 20 at 300/16).
  const eased = 1 - Math.pow(1 - t, 2);
  return Math.round(K_NEW - (K_NEW - K_VET) * eased);
}

// ─── STEP 5: Spread stake multiplier ─────────────────────────────────────────
// Spread picks are harder, so they play for higher stakes — the multiplier
// scales the gain AND the loss equally.
//
// It is deliberately symmetric. Paying spreads more on a win than they cost on
// a loss would hand every user free expected Elo: at a coin-flip 50% hit rate,
// a 1.35×gain / 1.10×loss split nets ~+0.06·K per pick for picking at random,
// which is farmable. Symmetric = more volatility, identical EV, no exploit.
// The genuine *reward* for taking the harder bet lives in XP (see lib/xp.ts),
// which is not zero-sum.

export function getSpreadMultiplier(betType: BetType): number {
  return betType === 'spread' ? 1.35 : 1.0;
}

// Reverse of impliedProbToEventElo — given an event Elo, return the market-implied
// win probability for the side that Elo was computed for.
export function eventEloToProb(eventElo: number): number {
  return 1 / (1 + Math.pow(10, (eventElo - 1200) / 400));
}

// ─── STEP 6: The full Elo delta calculation ───────────────────────────────────
// This is called TWICE:
//   1. Before the pick (to show the user projected gain/loss)
//   2. After the game (to calculate the actual Elo change)

export function calculateEloDelta({
  userElo,
  eventElo,
  kFactor,
  confidenceLevel,
  betType,
  outcome,
}: {
  userElo: number;
  eventElo: number;
  kFactor: number;
  confidenceLevel: ConfidenceLevel;
  betType: BetType;
  outcome: PickOutcome;
}): {
  expectedScore: number;
  finalEloDelta: number;
  newElo: number;
  projectedGain: number;
  projectedLoss: number;
} {
  // Expected score: how likely is this user to beat this event?
  const expectedScore = 1 / (1 + Math.pow(10, (eventElo - userElo) / 400));

  const actualScore = outcome === 'win' ? 1 : 0;

  // Base Elo change (before multipliers)
  const baseEloDelta = kFactor * (actualScore - expectedScore);

  // Apply confidence and spread multipliers
  const confMult   = CONFIDENCE_MULTIPLIERS[confidenceLevel];
  const spreadMult = getSpreadMultiplier(betType);

  // Push = no action (stake returned), matching sportsbook convention.
  // Scoring it as 0.5 would penalize favorite picks on a tie.
  const finalEloDelta = outcome === 'push'
    ? 0
    : Math.round(baseEloDelta * confMult * spreadMult);

  // Rating floor. Chess convention — a floor well beneath any competitive
  // rating, so hitting it means something has gone very wrong rather than
  // being a place to farm from. (Elo is self-correcting anyway: climbing back
  // raises expectedScore, which shrinks gains automatically.) 0 was a worse
  // floor because it let a user sit at literal zero with nothing to lose.
  const newElo = Math.max(ELO_FLOOR, userElo + finalEloDelta);

  // Pre-pick projections (shown to user before they confirm).
  // These mirror finalEloDelta exactly: a win pays +projectedGain, a loss
  // costs −projectedLoss. The loss is capped by the distance to the floor so
  // the UI can never advertise a risk larger than the user can actually take.
  const projectedGain = Math.round(
    kFactor * (1 - expectedScore) * confMult * spreadMult
  );
  const projectedLoss = Math.min(
    Math.round(kFactor * expectedScore * confMult * spreadMult),
    Math.max(0, userElo - ELO_FLOOR),
  );

  return {
    expectedScore,
    finalEloDelta,
    newElo,
    projectedGain,
    projectedLoss,
  };
}

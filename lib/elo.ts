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

export function getKFactor(totalPicks: number, weeksActive: number): number {
  if (totalPicks < 30  || weeksActive < 2)  return 64;
  if (totalPicks < 100 || weeksActive < 6)  return 40;
  if (totalPicks < 300 || weeksActive < 16) return 28;
  return 20;
}

// ─── STEP 5: Spread bonus multiplier ─────────────────────────────────────────
// Spread picks are harder → reward them with a bonus

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

  // Floor guard: Elo can never go below 0
  const newElo = Math.max(0, userElo + finalEloDelta);

  // Pre-pick projections (shown to user before they confirm)
  const projectedGain = Math.round(
    kFactor * (1 - expectedScore) * confMult * spreadMult
  );
  const projectedLoss = Math.round(
    kFactor * expectedScore * confMult * spreadMult
  );

  return {
    expectedScore,
    finalEloDelta,
    newElo,
    projectedGain,
    projectedLoss,
  };
}

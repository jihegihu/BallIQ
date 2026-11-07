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

/**
 * Where a new account begins.
 *
 * 800 rather than 1200: the eventElo scale puts an even game at 1200, so 1200
 * is "market-rate skill", not a beginning. Starting below it means the early
 * climb is fast and visible (an even game pays about +56/-8 at 800) and the
 * first arena tiers fall every few picks, instead of a new user arriving
 * halfway up a ladder they did not climb.
 */
export const START_ELO = 800;

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
//
// The one invariant this function exists to protect:
//
//   A picker with no skill must not gain rating, whatever they pick.
//
// Write out the expected value of a single pick. The market says the chosen
// side wins with probability p; the rating system expects it with probability
// E. Gain is stake(1 − E), loss is stake·E, so:
//
//   EV = p·stake(1 − E) − (1 − p)·stake·E
//      = stake(p − E)
//
// Because impliedProbToEventElo is calibrated so that E == p at 1200, EV is
// exactly 0 at 1200 — for EVERY p. A 15% underdog and an 85% favourite both
// pay nothing in expectation, so "always take the favourite" and "always take
// the dog" are equally worthless. Above 1200, E > p and the rating decays
// toward 1200; below it, E < p and it climbs. 1200 is the market's own level,
// and the only way past it is to actually beat the market.
//
// This used to carry a PARTICIPATION_BONUS of 0.12·K, added to the gain and
// taken off the loss, to stop the board feeling like it only ever offered
// losses. The algebra above is why that had to go: a flat bonus makes
// EV = stake(p − E) + B, so at baseline EV == B > 0 and every account inflates
// no matter how it picks. The house bot, which blindly picks favourites from
// 1200, climbed ~+270 over 500 picks and so did everyone else — a zero-skill
// favourite-picker scored about the same as a genuinely +4%-edge picker, which
// made the whole rating meaningless. Worse, the bonus had to be capped on
// heavy underdogs (where it would otherwise swallow the loss whole), and that
// cap made it strategy-dependent: favourites collected the full bonus,
// underdogs a fraction, so favourite-spamming paid ~66 Elo more per 500 picks.
//
// Engagement rewards belong in XP (lib/xp.ts), which is not zero-sum and can
// be as generous as we like. Rating is zero-sum by construction; the moment it
// pays people for showing up it stops measuring anything.

/**
 * How much of the user's distance from 1200 counts toward expectations.
 *
 * Standard Elo would use the full distance (1.0). Shrinking it does NOT move
 * the break-even point — that is pinned to 1200 by the E == p calibration for
 * any value of this constant — it only weakens the restoring force, which
 * stretches out how far genuine skill carries you above 1200.
 *
 * That stretch is the whole reason it is not 1.0. With the full distance a
 * market-beating edge barely registers: the ladder in lib/tiers.ts would have
 * to fit every skill level between 1200 and ~1290, so a single pick would
 * cross a tier. Measured over 600 picks at K=20:
 *
 *   dampen   no skill   +4% edge   +8%   +12%   skill span   signal/noise
 *     0.50       1204       1275   1343   1415          211           3.3
 *     0.25       1209       1342   1477   1618          409           4.6
 *     0.15       1213       1413   1613   1829          616           5.4
 *
 * Lower is better on both axes at first — the no-skill mean stays pinned near
 * 1205 while the skill span grows — but as this approaches 0 the restoring
 * force vanishes and the rating degenerates into an unbounded random walk with
 * no equilibrium at all. 0.25 takes most of the available separation while
 * keeping the pull back to 1200 firm enough that a hot streak decays over
 * ~150 picks rather than never.
 */
export const RATING_DAMPEN = 0.25;

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
  // Damped rating: real skill still shifts the odds, just not as sharply.
  const effectiveElo = 1200 + (userElo - 1200) * RATING_DAMPEN;
  const expectedScore = 1 / (1 + Math.pow(10, (eventElo - effectiveElo) / 400));

  const confMult   = CONFIDENCE_MULTIPLIERS[confidenceLevel];
  const spreadMult = getSpreadMultiplier(betType);
  const stake      = kFactor * confMult * spreadMult;

  // Two halves of one transfer: what the loss risks is what the win pays.
  // Nothing is added to either side, which is the whole point (see above).
  //
  // The floor of 1 keeps a win from paying 0 on a near-certain favourite,
  // where stake(1 - E) rounds away. It applies to the loss too, so the
  // symmetry survives; the residual EV it leaves at the extremes is a
  // fraction of an Elo point and the 0.01/0.99 probability clamp in
  // impliedProbToEventElo bounds how far it can go.
  const projectedGain = Math.max(1, Math.round(stake * (1 - expectedScore)));
  const projectedLoss = Math.min(
    Math.max(1, Math.round(stake * expectedScore)),
    Math.max(0, userElo - ELO_FLOOR),
  );

  // Derived from the same two numbers the user was shown, so what the board
  // promised and what settlement pays can never drift apart.
  // Push = no action (stake returned), matching sportsbook convention.
  const finalEloDelta =
    outcome === 'push' ? 0 :
    outcome === 'win'  ? projectedGain : -projectedLoss;

  // Rating floor. Chess convention — a floor well beneath any competitive
  // rating, so hitting it means something has gone very wrong rather than
  // being a place to farm from.
  const newElo = Math.max(ELO_FLOOR, userElo + finalEloDelta);

  return { expectedScore, finalEloDelta, newElo, projectedGain, projectedLoss };
}

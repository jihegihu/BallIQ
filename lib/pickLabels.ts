// User-facing names for the three pick types.
//
// Deliberately steered off sportsbook vocabulary: BallIQ is a skill-rating
// game with no money in it, and "Moneyline" / "Over-Under" make it read like
// a betting app — both to users and to an App Store reviewer working through
// the gambling guidelines. The underlying BetType values are unchanged, so
// nothing in the DB or the Elo engine is affected.

import { BetType } from '@/types';

export const PICK_LABEL: Record<BetType, string> = {
  moneyline:  'Winner',
  spread:     'Margin',
  over_under: 'Total',
};

/** One-line explanation shown under each heading. */
export const PICK_HINT: Record<BetType, string> = {
  moneyline:  'who wins the game',
  spread:     'win margin vs the line',
  over_under: 'combined score vs the line',
};

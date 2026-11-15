// Sample content for the walkthrough's "results and stats" stop.
//
// A new account has no settled picks, so that screen would otherwise be an
// empty state — which shows a new user nothing about what they are working
// towards. These stand in until real results exist, and are labelled as
// examples so nobody mistakes them for their own record.

import type { UserPick } from '@/types';

function ExampleTag() {
  return (
    <span className="inline-block text-[9px] font-black uppercase tracking-widest text-accent bg-accent/15 rounded-md px-1.5 py-px">
      Example
    </span>
  );
}

export function ExampleResultsLabel() {
  return <div className="mb-1.5"><ExampleTag /></div>;
}

const settled = new Date().toISOString();

/**
 * Two finished picks, shaped like real ones so the picks page can draw them
 * with the same card it uses for everything else.
 */
export const EXAMPLE_RESULTS: UserPick[] = [
  {
    id: 'example-win', matchId: 'example-1', sport: 'NBA',
    matchDescription: 'Boston Celtics vs New York Knicks',
    betType: 'moneyline', pickSide: 'home', confidenceLevel: 'medium',
    userEloAtPick: 800, eventElo: 1200, projectedGain: 38, projectedLoss: 26,
    outcome: 'win', eloDelta: 38, xpEarned: 0, placedAt: settled, resolvedAt: settled,
  },
  {
    id: 'example-loss', matchId: 'example-2', sport: 'NFL',
    matchDescription: 'Kansas City Chiefs vs Buffalo Bills',
    betType: 'moneyline', pickSide: 'away', confidenceLevel: 'medium',
    userEloAtPick: 838, eventElo: 1200, projectedGain: 34, projectedLoss: 24,
    outcome: 'loss', eloDelta: -24, xpEarned: 0, placedAt: settled, resolvedAt: settled,
  },
];

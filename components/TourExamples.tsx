// Sample content for the walkthrough's "results and stats" stop.
//
// A new account has no settled picks, so that screen would otherwise be an
// empty state — which shows a new user nothing about what they are working
// towards. These stand in until real results exist, and are labelled as
// examples so nobody mistakes them for their own record.

import { StatTile } from '@/components/StatPieces';
import Icon from '@/components/Icon';
import type { UserPick } from '@/types';

function ExampleTag() {
  return (
    <span className="inline-block text-[9px] font-black uppercase tracking-widest text-accent bg-accent/15 rounded-md px-1.5 py-px">
      Example
    </span>
  );
}

/** The stats strip and headline tiles, with made-up numbers. */
export function ExampleStats() {
  return (
    <div className="mb-4">
      <div className="mb-1.5"><ExampleTag /></div>
      <div className="w-full bg-card border border-rim rounded-xl px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm font-black tabular-nums">
          <span>
            <span className="text-good">12W</span>
            <span className="text-dim mx-0.5">–</span>
            <span className="text-bad">7L</span>
          </span>
          <span className="text-sub text-xs font-bold">63%</span>
          <span className="text-good">+84 Elo</span>
        </div>
        <span className="flex items-center gap-1 text-[10px] font-bold text-dim uppercase tracking-widest">
          Stats <Icon name="chevronDown" size={14} />
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <StatTile label="Best" value="+31" sub="Elo" tone="good" />
        <StatTile label="Last 10" value="70%" sub="7/10" tone="good" />
        <StatTile label="Streak" value="4" sub="days" />
      </div>
    </div>
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

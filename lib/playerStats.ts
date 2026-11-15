// A player's record, worked out from their settled picks. Pure.
//
// The old stats panel answered "what is my record" three slightly different
// ways and stopped there. This answers the questions a player actually asks:
// how am I doing lately, where does my rating come from, and what should I do
// more or less of.

import type { UserPick, Sport } from '@/types';
import { summarizeRecord } from './record';
import { eventEloToProb } from './elo';
import { PICK_LABEL } from './pickLabels';

export type StatRow = {
  key: string;
  name: string;
  wins: number;
  losses: number;
  pushes: number;
  /** Picks that went one way or the other. */
  decided: number;
  winRate: number | null;
  /** Elo won or lost on these picks. */
  net: number;
};

export type PlayerStats = {
  wins: number;
  losses: number;
  pushes: number;
  decided: number;
  winRate: number | null;
  net: number;
  /** The last ten decided picks, oldest first. */
  form: ('W' | 'L')[];
  /** The streak they are on right now. */
  run: { kind: 'W' | 'L'; length: number } | null;
  /** Longest run of wins ever. */
  bestRun: number;
  /** Largest single gain. */
  bestPick: number;
  bySport: StatRow[];
  byType: StatRow[];
  byOdds: StatRow[];
  /** Where the most Elo has come from, and where the most has gone. */
  strongest: StatRow | null;
  weakest: StatRow | null;
};

const SPORT_NAME: Partial<Record<Sport, string>> = {
  EPL: 'Premier League', LALIGA: 'La Liga', BUNDESLIGA: 'Bundesliga',
  SERIEA: 'Serie A', WORLDCUP: 'World Cup', TENNIS: 'Tennis',
};

/** A category needs this many decided picks before it is called a strength or a weakness. */
const MIN_SAMPLE = 3;

function row(key: string, name: string, picks: UserPick[]): StatRow {
  const r = summarizeRecord(picks.map((p) => p.outcome));
  return {
    key, name,
    wins: r.wins, losses: r.losses, pushes: r.pushes,
    decided: r.decided, winRate: r.winRate,
    net: picks.reduce((s, p) => s + (p.eloDelta ?? 0), 0),
  };
}

/**
 * How likely the market thought this pick was. Favourites and underdogs are
 * different skills — backing 70% shots and getting 70% of them right earns
 * nothing — so the split is worth seeing on its own.
 */
function oddsBucket(p: UserPick): 'fav' | 'close' | 'dog' {
  const prob = eventEloToProb(p.eventElo);
  return prob >= 0.6 ? 'fav' : prob < 0.45 ? 'dog' : 'close';
}

const when = (p: UserPick) => new Date(p.resolvedAt ?? p.placedAt).getTime();

export function computePlayerStats(picks: UserPick[]): PlayerStats {
  const total = summarizeRecord(picks.map((p) => p.outcome));
  const graded = picks.filter((p) => p.outcome === 'win' || p.outcome === 'loss' || p.outcome === 'push');

  // Decided picks in the order they settled.
  const decided = graded
    .filter((p) => p.outcome === 'win' || p.outcome === 'loss')
    .sort((a, b) => when(a) - when(b));
  const letters = decided.map((p) => (p.outcome === 'win' ? 'W' : 'L') as 'W' | 'L');

  let bestRun = 0, streak = 0;
  for (const l of letters) {
    streak = l === 'W' ? streak + 1 : 0;
    if (streak > bestRun) bestRun = streak;
  }

  let run: PlayerStats['run'] = null;
  if (letters.length > 0) {
    const kind = letters[letters.length - 1];
    let length = 0;
    for (let i = letters.length - 1; i >= 0 && letters[i] === kind; i--) length++;
    run = { kind, length };
  }

  const group = <K extends string>(keyOf: (p: UserPick) => K | null) => {
    const map = new Map<K, UserPick[]>();
    for (const p of graded) {
      const k = keyOf(p);
      if (k === null) continue;
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return map;
  };

  const byNet = (a: StatRow, b: StatRow) => b.net - a.net;

  const bySport = [...group((p) => p.sport ?? null).entries()]
    .map(([s, list]) => row(s, SPORT_NAME[s] ?? s, list))
    .sort(byNet);

  const byType = [...group((p) => p.betType).entries()]
    .map(([t, list]) => row(t, PICK_LABEL[t], list))
    .sort(byNet);

  const odds = group(oddsBucket);
  const byOdds = ([
    ['fav', 'Favorites'], ['close', 'Close games'], ['dog', 'Underdogs'],
  ] as const)
    .filter(([k]) => odds.has(k))
    .map(([k, name]) => row(k, name, odds.get(k)!));

  // Only worth naming when there is something to compare, and enough picks
  // behind each for the figure not to be one lucky night.
  const sized = bySport.filter((r) => r.decided >= MIN_SAMPLE);
  const strongest = sized.length >= 2 && sized[0].net > 0 ? sized[0] : null;
  const last = sized[sized.length - 1];
  const weakest = sized.length >= 2 && last.net < 0 ? last : null;

  return {
    wins: total.wins, losses: total.losses, pushes: total.pushes,
    decided: total.decided, winRate: total.winRate,
    net: graded.reduce((s, p) => s + (p.eloDelta ?? 0), 0),
    form: letters.slice(-10),
    run, bestRun,
    bestPick: graded.reduce((m, p) => Math.max(m, p.eloDelta ?? 0), 0),
    bySport, byType, byOdds,
    strongest, weakest,
  };
}

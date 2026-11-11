// Scoring "is this a big game?" for the evening pick reminder.
//
// There is no feed that tells us a game matters. So this combines four signals,
// chosen by what is actually available rather than what would be ideal —
// measured against the live board on 2026-11-10:
//
//   odds           100% of upcoming games    the only dependable signal
//   team records    32% overall, 10% of the next 24h
//   broadcast       23% overall, 10% of the next 24h
//
// ESPN enrichment is sparsest exactly where a daily notification needs it
// (tonight's slate), so records and broadcast can only ever be a bonus. The
// backbone has to be odds plus things we derive ourselves.

import { americanOddsToImpliedProb, removeVig } from './elo';

// ── Signal 1: how close the game is ──────────────────────────────────────────
// A coin-flip is the most interesting game to rate yourself on: real skill
// shows up where the market is unsure, and both sides pay meaningfully.

function closeness(mlHome: number, mlAway: number): number {
  const { probA } = removeVig(
    americanOddsToImpliedProb(mlHome),
    americanOddsToImpliedProb(mlAway),
  );
  // 1.0 at 50/50, 0.0 at a certainty.
  return Math.max(0, 1 - Math.abs(probA - 0.5) / 0.5);
}

// ── Signal 2: marquee teams ──────────────────────────────────────────────────
// The part no formula gives you. Lakers-Celtics is a big game at any price, and
// a 50/50 Hornets-Wizards is not. This is a judgement call encoded as a list,
// which makes it the one thing here needing occasional upkeep.
//
// Strings must match the odds feed EXACTLY — these were read off the live
// `matches` table, not written from memory, because a near-miss silently
// scores zero and nothing would ever tell you.
const MARQUEE = new Set<string>([
  // NBA — national-TV regulars and the biggest draws
  'Los Angeles Lakers', 'Boston Celtics', 'Golden State Warriors', 'New York Knicks',
  'Philadelphia 76ers', 'Milwaukee Bucks', 'Denver Nuggets', 'Dallas Mavericks',
  'Phoenix Suns', 'Oklahoma City Thunder', 'Cleveland Cavaliers', 'Los Angeles Clippers',
  // NFL
  'Kansas City Chiefs', 'Dallas Cowboys', 'San Francisco 49ers', 'Philadelphia Eagles',
  'Buffalo Bills', 'Green Bay Packers', 'Baltimore Ravens', 'Detroit Lions',
  'Pittsburgh Steelers', 'New England Patriots', 'Cincinnati Bengals', 'Los Angeles Rams',
  // MLB
  'New York Yankees', 'Los Angeles Dodgers', 'Boston Red Sox', 'Chicago Cubs',
  'New York Mets', 'Atlanta Braves', 'Houston Astros', 'Philadelphia Phillies',
  // Soccer clubs
  'Manchester City', 'Manchester United', 'Liverpool', 'Arsenal', 'Chelsea',
  'Tottenham Hotspur', 'Newcastle United', 'Barcelona', 'Real Betis', 'Sevilla',
  'Athletic Bilbao', 'Bayern Munich', 'Borussia Dortmund', 'Bayer Leverkusen',
  'RB Leipzig', 'AS Roma', 'Napoli',
  // World Cup nations
  'Brazil', 'Argentina', 'France', 'England', 'Spain', 'Germany', 'Portugal',
  'Netherlands', 'USA', 'Mexico', 'Belgium', 'Croatia', 'Japan',
  // Tennis — draws in their own right
  'Jannik Sinner', 'Novak Djokovic', 'Carlos Alcaraz', 'Daniil Medvedev',
  'Alexander Zverev', 'Taylor Fritz', 'Jack Draper', 'Ben Shelton',
  'Iga Swiatek', 'Aryna Sabalenka', 'Coco Gauff', 'Naomi Osaka',
  'Emma Raducanu', 'Elena Rybakina', 'Madison Keys', 'Jessica Pegula',
]);

/** 1.0 when both sides are a draw, 0.5 for one, 0 for neither. */
function marquee(home: string, away: string): number {
  return (MARQUEE.has(home) ? 0.5 : 0) + (MARQUEE.has(away) ? 0.5 : 0);
}

// ── Signal 3: broadcast ──────────────────────────────────────────────────────
// Set on only a fraction of games, so it lifts a game it is present on and
// never penalises one it is missing from.
const NATIONAL = /\b(ABC|CBS|NBC|FOX|ESPN|TNT|TBS|Prime Video|Peacock|Apple TV)\b/i;
const SECONDARY = /(ESPN\+|Paramount\+|Deportes|\bMax\b|\bHulu\b)/i;

function broadcastWeight(broadcast: string | null | undefined): number {
  if (!broadcast) return 0;
  // Checked first on purpose: "ESPN Deportes · ESPN+" also matches NATIONAL on
  // the bare word ESPN, but it is a secondary feed, not the main window.
  if (SECONDARY.test(broadcast)) return 0.4;
  if (NATIONAL.test(broadcast)) return 1.0;
  return 0.1;   // a local or regional affiliate
}

// ── Weights ──────────────────────────────────────────────────────────────────
// Closeness and marquee carry it, because they are the two reliably available
// (odds always, the list always). Pick volume is real social proof but does
// nothing until there is a crowd, and broadcast is set on roughly 1 in 10 of
// tonight's games, so both are deliberately small.
const W_CLOSE = 0.40;
const W_MARQUEE = 0.35;
const W_VOLUME = 0.15;
const W_BROADCAST = 0.10;

export type ScorableGame = {
  id: string;
  sport: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  moneyline_home: number | null;
  moneyline_away: number | null;
  broadcast?: string | null;
};

export type ScoredGame = {
  game: ScorableGame;
  score: number;
  /** Component breakdown, so a surprising choice can be explained, not guessed. */
  parts: { closeness: number; marquee: number; volume: number; broadcast: number };
};

/**
 * Rank games by how "big" they are, highest first.
 *
 * `pickCounts` maps match id → how many BallIQ users have picked it, normalised
 * against the busiest game in the set. Relative rather than absolute on
 * purpose: an absolute threshold would score every game ~0 while the user base
 * is small, which is exactly the situation today.
 */
export function scoreGames(
  games: ScorableGame[],
  pickCounts: Map<string, number> = new Map(),
): ScoredGame[] {
  const busiest = Math.max(1, ...[...pickCounts.values()]);

  return games
    .filter((g) => g.moneyline_home != null && g.moneyline_away != null)
    .map((g) => {
      const parts = {
        closeness: closeness(g.moneyline_home as number, g.moneyline_away as number),
        marquee:   marquee(g.home_team, g.away_team),
        volume:    Math.min(1, (pickCounts.get(g.id) ?? 0) / busiest),
        broadcast: broadcastWeight(g.broadcast),
      };
      const score =
        parts.closeness * W_CLOSE +
        parts.marquee   * W_MARQUEE +
        parts.volume    * W_VOLUME +
        parts.broadcast * W_BROADCAST;
      return { game: g, score, parts };
    })
    .sort((a, b) => b.score - a.score);
}

/** "Lakers at Celtics" — the away-at-home phrasing the board uses. */
export function matchupLabel(g: ScorableGame): string {
  return `${shortTeam(g.away_team)} at ${shortTeam(g.home_team)}`;
}

/**
 * Last word of a team name ("Los Angeles Lakers" → "Lakers"), which is how
 * people say it and what fits one line of an iOS notification. Left whole for
 * single-word names, and for anything with an ampersand, where clipping a
 * nation like "Bosnia & Herzegovina" would mangle it. Tennis needs no special
 * case: a surname is already the last word.
 */
function shortTeam(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length < 2 || name.includes('&')) return name;
  return words[words.length - 1];
}

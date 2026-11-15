// Head-to-head pools: the rules, as pure functions.
//
// Nothing here touches the database, so every rule that decides who can join,
// which games are in a slate and who gets paid can be run and checked on its
// own. The database half lives in lib/poolsServer.ts.

import { ELO_FLOOR } from './elo';
import { etDay } from './xp';

export const POOL_SPORTS = ['NFL', 'EPL', 'NBA'] as const;
export type PoolSport = (typeof POOL_SPORTS)[number];

export function isPoolSport(s: unknown): s is PoolSport {
  return typeof s === 'string' && (POOL_SPORTS as readonly string[]).includes(s);
}

/** Elo each player puts up. The winner takes what the others staked. */
export const POOL_STAKE = 50;
/** Settled picks an account needs before it can play for rating. */
export const POOL_MIN_SETTLED_PICKS = 20;
export const POOL_MIN_MEMBERS = 2;
export const POOL_MAX_MEMBERS = 10;

/** Fewest games that make a slate worth competing over. */
export const POOL_MIN_GAMES: Record<PoolSport, number> = { NFL: 4, EPL: 4, NBA: 5 };

/** A slate must lock at least this far out, or nobody has time to join. */
export const POOL_LEAD_MS = 30 * 60 * 1000;

/**
 * How long after the last game starts we wait for every result before
 * settling on the games that did finish. Without a limit, one postponed
 * fixture would hold everybody's stake in limbo indefinitely.
 */
export const POOL_SETTLE_GRACE_HOURS = 72;

export type PoolSide = 'home' | 'away' | 'draw';

/** Soccer can end level, so its pools offer the draw; the others cannot. */
export function allowsDraw(sport: string): boolean {
  return sport === 'EPL';
}

// ── Weeks ────────────────────────────────────────────────────────────────────

const ET_WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Shift a YYYY-MM-DD calendar day by whole days, with no timezone involved. */
export function shiftDay(day: string, by: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + by);
  return t.toISOString().slice(0, 10);
}

/**
 * The Tuesday (US Eastern) that starts the week containing `when`.
 *
 * Tuesday, not Monday or Sunday, because that is where both football weeks
 * break: an NFL week runs Thursday to Monday night, and a Premier League
 * round runs Friday to Monday. A Monday or Sunday boundary would cut every
 * one of them in two.
 */
export function weekKey(when: string | Date): string {
  const d = typeof when === 'string' ? new Date(when) : when;
  const dow = DOW[ET_WEEKDAY.format(d)] ?? 0;
  return shiftDay(etDay(d), -((dow - 2 + 7) % 7));
}

// ── Slates ───────────────────────────────────────────────────────────────────

export type SlateGame = {
  id: string;
  sport: string;
  home_team: string;
  away_team: string;
  commence_time: string;
};

export type SlateOption = {
  /** Week sports: the week's Tuesday. NBA: the first night. Both YYYY-MM-DD. */
  key: string;
  nights: 1 | 2;
  label: string;
  weekKey: string;
  games: SlateGame[];
  locksAt: string;
  endsAt: string;
};

function dayLabel(day: string, withWeekday: boolean): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', ...(withWeekday ? { weekday: 'short' } : {}),
  });
}

function rangeLabel(first: string, last: string): string {
  if (first === last) return dayLabel(first, true);
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  return sameMonth
    ? `${dayLabel(first, false)}–${Number(last.slice(8, 10))}`
    : `${dayLabel(first, false)} – ${dayLabel(last, false)}`;
}

function option(key: string, nights: 1 | 2, games: SlateGame[]): SlateOption {
  const sorted = [...games].sort((a, b) => a.commence_time.localeCompare(b.commence_time));
  const first = sorted[0].commence_time;
  const last = sorted[sorted.length - 1].commence_time;
  return {
    key, nights,
    label: rangeLabel(etDay(first), etDay(last)),
    weekKey: weekKey(first),
    games: sorted,
    locksAt: first,
    endsAt: last,
  };
}

/**
 * The slates a pool can be created on right now.
 *
 * NFL and Premier League: every game left in a Tuesday-to-Monday week. Games
 * that have already started are simply not part of the slate, so a pool made
 * on Saturday covers Sunday and Monday.
 *
 * NBA: a full week is around fifty games, far too many to pick by hand, so a
 * slate is one night with enough games — or that night plus the next.
 */
export function slateOptions(sport: PoolSport, games: SlateGame[], now = new Date()): SlateOption[] {
  const min = POOL_MIN_GAMES[sport];
  const open = games.filter(
    (g) => g.sport === sport && new Date(g.commence_time).getTime() - now.getTime() > POOL_LEAD_MS,
  );

  if (sport === 'NBA') {
    const byNight = new Map<string, SlateGame[]>();
    for (const g of open) {
      const day = etDay(g.commence_time);
      byNight.set(day, [...(byNight.get(day) ?? []), g]);
    }
    const out: SlateOption[] = [];
    for (const day of [...byNight.keys()].sort()) {
      const tonight = byNight.get(day)!;
      const next = byNight.get(shiftDay(day, 1)) ?? [];
      if (tonight.length >= min) out.push(option(day, 1, tonight));
      if (next.length > 0 && tonight.length + next.length >= min) {
        out.push(option(day, 2, [...tonight, ...next]));
      }
    }
    return out.slice(0, 8);
  }

  const byWeek = new Map<string, SlateGame[]>();
  for (const g of open) {
    const wk = weekKey(g.commence_time);
    byWeek.set(wk, [...(byWeek.get(wk) ?? []), g]);
  }
  return [...byWeek.keys()].sort()
    .filter((wk) => byWeek.get(wk)!.length >= min)
    .slice(0, 2)
    .map((wk) => option(wk, 1, byWeek.get(wk)!));
}

// ── Results ──────────────────────────────────────────────────────────────────

export type MatchResultRow = {
  status: string | null;
  home_score: number | null;
  away_score: number | null;
  result_winner?: string | null;
};

/** Who won a finished game, or null while it is still undecided. */
export function resultOf(m: MatchResultRow): PoolSide | null {
  if (m.status !== 'completed' || m.home_score == null || m.away_score == null) return null;
  // An admin override exists for knockout games decided on penalties.
  if (m.result_winner === 'home' || m.result_winner === 'away') return m.result_winner;
  if (m.home_score > m.away_score) return 'home';
  if (m.away_score > m.home_score) return 'away';
  return 'draw';
}

// ── Payouts ──────────────────────────────────────────────────────────────────

export type Standing = { userId: string; elo: number; correct: number };

/**
 * Who pays and who is paid. Returns each player's Elo change.
 *
 * Most correct wins. Everyone else pays the stake and the winners split it,
 * so the changes always sum to exactly zero:
 *
 *   6 players, one winner   → winner +250, five others −50
 *   6 players, two tie      → +100 each,   four others −50
 *   everyone ties           → nothing moves
 *
 * A player cannot be taken below the rating floor, so someone sitting near it
 * pays what they have and the pot is that much smaller. When the pot does not
 * divide evenly between tied winners the odd points go to the first of them
 * (by id, so it is deterministic) rather than vanishing.
 */
export function computePayouts(standings: Standing[], stake = POOL_STAKE): Map<string, number> {
  const out = new Map<string, number>(standings.map((s) => [s.userId, 0]));
  if (standings.length < POOL_MIN_MEMBERS) return out;

  const best = Math.max(...standings.map((s) => s.correct));
  const winners = standings.filter((s) => s.correct === best).sort((a, b) => a.userId.localeCompare(b.userId));
  const losers = standings.filter((s) => s.correct !== best);
  if (losers.length === 0) return out;

  let pot = 0;
  for (const l of losers) {
    const pays = Math.min(stake, Math.max(0, l.elo - ELO_FLOOR));
    out.set(l.userId, -pays);
    pot += pays;
  }

  const share = Math.floor(pot / winners.length);
  let odd = pot - share * winners.length;
  for (const w of winners) {
    out.set(w.userId, share + (odd > 0 ? 1 : 0));
    if (odd > 0) odd--;
  }
  return out;
}

/** What one winner would net if everyone else lost. Shown before joining. */
export function potentialWin(members: number, stake = POOL_STAKE): number {
  return Math.max(0, members - 1) * stake;
}

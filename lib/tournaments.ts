// lib/tournaments.ts
// Tournament definitions used to bucket a user's picks into recap summaries.
//
// The odds feed does NOT tag games as "playoffs" vs "regular season" (NBA/NFL
// playoff games arrive under the same sport key as the regular season), so a
// tournament is defined by the SPORT(s) it covers plus the DATE WINDOW its
// games fall in. World Cup is its own sport key, so its window just spans the
// whole event. Adjust the dates as schedules firm up.

import { Sport, UserPick } from '@/types';

export type Tournament = {
  id: string;
  name: string;
  emoji: string;
  sports: Sport[];
  start: string; // 'YYYY-MM-DD' inclusive (UTC)
  end: string;   // 'YYYY-MM-DD' inclusive (UTC)
};

export const TOURNAMENTS: Tournament[] = [
  { id: 'world-cup-2026',    name: 'World Cup 2026',    emoji: '🌍', sports: ['WORLDCUP'], start: '2026-06-11', end: '2026-07-20' },
  { id: 'nba-playoffs-2026', name: 'NBA Playoffs 2026', emoji: '🏀', sports: ['NBA'],      start: '2026-04-18', end: '2026-06-22' },
  { id: 'nfl-playoffs-2026', name: 'NFL Playoffs',      emoji: '🏈', sports: ['NFL'],      start: '2027-01-09', end: '2027-02-09' },
];

function startMs(t: Tournament): number { return new Date(`${t.start}T00:00:00Z`).getTime(); }
function endMs(t: Tournament): number   { return new Date(`${t.end}T23:59:59Z`).getTime(); }

// Which tournament a pick belongs to (or null). Uses the game's start time when
// known, falling back to when the pick was placed.
export function pickTournament(pick: UserPick): Tournament | null {
  if (!pick.sport) return null;
  const when = new Date(pick.gameTime ?? pick.placedAt).getTime();
  if (Number.isNaN(when)) return null;
  for (const t of TOURNAMENTS) {
    if (t.sports.includes(pick.sport) && when >= startMs(t) && when <= endMs(t)) return t;
  }
  return null;
}

export function isTournamentLive(t: Tournament, now: number = Date.now()): boolean {
  return now >= startMs(t) && now <= endMs(t);
}

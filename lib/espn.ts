// lib/espn.ts
// Free game details (team records, venue, broadcast) from ESPN's public
// scoreboard JSON — no API key, no cost. Server-side only, called from the
// odds sync as a best-effort enrichment: every failure degrades to "no
// details" rather than breaking the sync.

import { Match, Sport } from '@/types';

// ESPN scoreboard path per sport. TENNIS has no usable ESPN scoreboard — skipped.
const LEAGUE_PATHS: Partial<Record<Sport, string>> = {
  NBA:        'basketball/nba',
  NFL:        'football/nfl',
  MLB:        'baseball/mlb',
  EPL:        'soccer/eng.1',
  LALIGA:     'soccer/esp.1',
  BUNDESLIGA: 'soccer/ger.1',
  SERIEA:     'soccer/ita.1',
  WORLDCUP:   'soccer/fifa.world',
};

export type GameDetails = {
  homeRecord?: string;
  awayRecord?: string;
  venue?: string;
  broadcast?: string;
};

// "Los Angeles Lakers" → "losangeleslakers": tolerant of punctuation and
// spacing differences between The Odds API and ESPN naming.
function norm(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function teamsMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN's JSON is unversioned and untyped */
type EspnEvent = any;

function extractDetails(ev: EspnEvent): { home: string; away: string; details: GameDetails } | null {
  const comp = ev?.competitions?.[0];
  if (!comp) return null;

  const competitors: any[] = comp.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === 'home');
  const away = competitors.find((c) => c.homeAway === 'away');
  if (!home?.team?.displayName || !away?.team?.displayName) return null;

  const record = (c: any): string | undefined => {
    const total = (c.records ?? []).find((r: any) => r.type === 'total' || r.name === 'overall');
    return typeof total?.summary === 'string' ? total.summary : undefined;
  };

  const broadcastNames: string[] = (comp.broadcasts ?? [])
    .flatMap((b: any) => b.names ?? [])
    .filter((n: unknown): n is string => typeof n === 'string');

  return {
    home: home.team.displayName,
    away: away.team.displayName,
    details: {
      homeRecord: record(home),
      awayRecord: record(away),
      venue:      typeof comp.venue?.fullName === 'string' ? comp.venue.fullName : undefined,
      broadcast:  broadcastNames.length > 0 ? broadcastNames.slice(0, 2).join(' · ') : undefined,
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// YYYYMMDD in UTC — ESPN's ?dates= format.
function espnDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '');
}

async function fetchScoreboard(leaguePath: string, date: string): Promise<EspnEvent[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${leaguePath}/scoreboard?dates=${date}`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json?.events) ? json.events : [];
}

/**
 * Fetch ESPN details for the given matches, keyed by match id.
 * One scoreboard request per (sport, date) pair — a typical sync needs ~5-15
 * requests total, all free. Any network/shape failure yields an empty result
 * for that league-day only.
 */
export async function fetchGameDetails(matches: Match[]): Promise<Map<string, GameDetails>> {
  const out = new Map<string, GameDetails>();

  // Group matches by (league, UTC date) so each scoreboard is fetched once.
  const groups = new Map<string, { leaguePath: string; date: string; matches: Match[] }>();
  for (const m of matches) {
    const leaguePath = LEAGUE_PATHS[m.sport];
    if (!leaguePath) continue;
    const date = espnDate(m.commenceTime);
    const key  = `${leaguePath}|${date}`;
    const g    = groups.get(key) ?? { leaguePath, date, matches: [] };
    g.matches.push(m);
    groups.set(key, g);
  }

  await Promise.all(
    [...groups.values()].map(async ({ leaguePath, date, matches: group }) => {
      try {
        const events = await fetchScoreboard(leaguePath, date);
        for (const ev of events) {
          const parsed = extractDetails(ev);
          if (!parsed) continue;
          const hit = group.find(
            (m) => teamsMatch(m.homeTeam, parsed.home) && teamsMatch(m.awayTeam, parsed.away),
          );
          if (hit && !out.has(hit.id)) out.set(hit.id, parsed.details);
        }
      } catch (err) {
        console.warn(`[espn] scoreboard ${leaguePath} ${date} failed:`, err);
      }
    }),
  );

  return out;
}

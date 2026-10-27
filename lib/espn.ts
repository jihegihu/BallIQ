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

// National sides where the odds feed and ESPN simply use different names, so
// no amount of substring matching will connect them.
const NAME_ALIASES: Record<string, string> = {
  usa: 'unitedstates',
  unitedstatesofamerica: 'unitedstates',
  southkorea: 'korearepublic',
  czechrepublic: 'czechia',
  turkey: 'turkiye',
  ivorycoast: 'cotedivoire',
  drcongo: 'congodr',
  bosniaandherzegovina: 'bosniaherzegovina',
};

function canon(s: string): string {
  const n = norm(s);
  return NAME_ALIASES[n] ?? n;
}

function teamsMatch(a: string, b: string): boolean {
  const na = canon(a);
  const nb = canon(b);
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

// ── Scores ────────────────────────────────────────────────────────────────────
// ESPN also serves final scores, for free, with no 3-day lookback limit. That
// matters: The Odds API's /scores endpoint only reaches back `daysFrom=3`, so
// when a sync outage runs longer than that its results become permanently
// unobtainable and the picks on them can only be voided. ESPN's historical
// scoreboard closes that hole and costs no odds credits.

/** Mirrors CompletedGame in lib/odds.ts, keyed by OUR match id. */
export type EspnScore = {
  id: string;           // the Odds API match id this resolves
  homeScore: number;
  awayScore: number;
  completed: boolean;
};

/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN's JSON is unversioned */
function readScores(ev: any): { home: string; away: string; hs: number; as: number; completed: boolean } | null {
  const comp = ev?.competitions?.[0];
  if (!comp) return null;
  const competitors: any[] = comp.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === 'home');
  const away = competitors.find((c) => c.homeAway === 'away');
  if (!home?.team?.displayName || !away?.team?.displayName) return null;

  const hs = Number(home.score);
  const as = Number(away.score);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;

  return {
    home: home.team.displayName,
    away: away.team.displayName,
    hs, as,
    // 'post' alone isn't enough — a postponed game is also past its slot.
    completed: ev?.status?.type?.completed === true,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Final scores for the given matches, from ESPN. Only returns games ESPN
 * reports as genuinely completed, so an abandoned or postponed fixture is
 * never graded. Any league-day that fails is skipped rather than throwing —
 * this is a best-effort fallback, never the primary path.
 */
export async function fetchEspnScores(matches: Match[]): Promise<EspnScore[]> {
  const out: EspnScore[] = [];

  // Group by league, and for each match look at the day before, the day of and
  // the day after its UTC kick-off. ESPN keys its scoreboard by US calendar
  // date, so a 00:15 UTC fixture lives on the PREVIOUS US day — checking only
  // the UTC date silently missed every late-evening American game.
  const byLeague = new Map<string, { dates: Set<string>; matches: Match[] }>();
  for (const m of matches) {
    const leaguePath = LEAGUE_PATHS[m.sport];
    if (!leaguePath) continue;             // tennis has no ESPN scoreboard
    const g = byLeague.get(leaguePath) ?? { dates: new Set<string>(), matches: [] };
    const t = new Date(m.commenceTime).getTime();
    for (const shift of [-1, 0, 1]) {
      g.dates.add(espnDate(new Date(t + shift * 86_400_000).toISOString()));
    }
    g.matches.push(m);
    byLeague.set(leaguePath, g);
  }

  await Promise.all(
    [...byLeague.entries()].map(async ([leaguePath, { dates, matches: group }]) => {
      const events: EspnEvent[] = [];
      await Promise.all(
        [...dates].map(async (date) => {
          try {
            events.push(...(await fetchScoreboard(leaguePath, date)));
          } catch (err) {
            console.warn('[espn] scoreboard fetch failed', leaguePath, date, err);
          }
        }),
      );

      for (const ev of events) {
        const parsed = readScores(ev);
        if (!parsed || !parsed.completed) continue;
        const hit = group.find(
          (m) => teamsMatch(m.homeTeam, parsed.home) && teamsMatch(m.awayTeam, parsed.away),
        );
        if (hit && !out.some((o) => o.id === hit.id)) {
          out.push({ id: hit.id, homeScore: parsed.hs, awayScore: parsed.as, completed: true });
        }
      }
    }),
  );

  return out;
}

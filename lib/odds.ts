// lib/odds.ts
// Fetches real Vegas odds from The-Odds-API and transforms them into Match objects.
// Called server-side only — ODDS_API_KEY is never exposed to the browser.

import { Match, Sport } from '@/types';
import { americanOddsToImpliedProb, impliedProbToEventElo, removeVig } from './elo';

const BASE_URL = 'https://api.the-odds-api.com/v4';

const SPORT_KEYS: Partial<Record<Sport, string | readonly string[]>> = {
  NBA:        'basketball_nba',
  NFL:        'americanfootball_nfl',
  MLB:        'baseball_mlb',
  EPL:        'soccer_epl',
  LALIGA:     'soccer_spain_la_liga',
  BUNDESLIGA: 'soccer_germany_bundesliga',
  SERIEA:     'soccer_italy_serie_a',
  // Tennis: tries all major tournaments; inactive ones return 404 and are silently skipped
  TENNIS: [
    'tennis_atp_french_open',
    'tennis_wta_french_open',
    'tennis_atp_wimbledon',
    'tennis_wta_wimbledon',
    'tennis_atp_us_open',
    'tennis_wta_us_open',
    'tennis_atp_aus_open',
    'tennis_wta_aus_open',
  ],
};

// ── Odds API response shape ───────────────────────────────────────────────────

type OddsOutcome  = { name: string; price: number; point?: number };
type OddsMarket   = { key: string; outcomes: OddsOutcome[] };
type OddsBookmaker = { key: string; markets: OddsMarket[] };
type OddsGame = {
  id: string;
  sport_key: string;
  commence_time: string; // ISO 8601, e.g. "2026-12-31T00:00:00Z"
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildEventElos(
  mlHome: number, mlAway: number,
  spHome: number, spAway: number,
  overOdds: number, underOdds: number,
): Match['eventElos'] {
  const { probA: probHome, probB: probAway } = removeVig(
    americanOddsToImpliedProb(mlHome),
    americanOddsToImpliedProb(mlAway),
  );
  const { probA: probOver, probB: probUnder } = removeVig(
    americanOddsToImpliedProb(overOdds),
    americanOddsToImpliedProb(underOdds),
  );
  const { probA: probSpH, probB: probSpA } = removeVig(
    americanOddsToImpliedProb(spHome),
    americanOddsToImpliedProb(spAway),
  );
  return {
    moneylineHome: impliedProbToEventElo(probHome),
    moneylineAway: impliedProbToEventElo(probAway),
    over:          impliedProbToEventElo(probOver),
    under:         impliedProbToEventElo(probUnder),
    spreadHome:    impliedProbToEventElo(probSpH),
    spreadAway:    impliedProbToEventElo(probSpA),
  };
}

// Scans a game's bookmakers to assemble all 3 markets (h2h, spreads, totals).
// Takes best available from each bookmaker independently so we always get odds.
function pickMarkets(game: OddsGame): {
  h2h: OddsMarket; spreads: OddsMarket; totals: OddsMarket;
} | null {
  let h2h: OddsMarket | undefined;
  let spreads: OddsMarket | undefined;
  let totals: OddsMarket | undefined;

  for (const bm of game.bookmakers) {
    if (!h2h)    h2h    = bm.markets.find(m => m.key === 'h2h');
    if (!spreads) spreads = bm.markets.find(m => m.key === 'spreads');
    if (!totals)  totals  = bm.markets.find(m => m.key === 'totals');
    if (h2h && spreads && totals) break;
  }

  if (!h2h || !spreads || !totals) return null;
  return { h2h, spreads, totals };
}

function transformGame(game: OddsGame, sport: Sport): Match | null {
  const markets = pickMarkets(game);
  if (!markets) return null;

  const { h2h, spreads, totals } = markets;

  const homeH2h    = h2h.outcomes.find(o => o.name === game.home_team);
  const awayH2h    = h2h.outcomes.find(o => o.name === game.away_team);
  const homeSpread = spreads.outcomes.find(o => o.name === game.home_team);
  const awaySpread = spreads.outcomes.find(o => o.name === game.away_team);
  const overLine   = totals.outcomes.find(o => o.name === 'Over');
  const underLine  = totals.outcomes.find(o => o.name === 'Under');

  if (!homeH2h || !awayH2h || !homeSpread || !awaySpread || !overLine || !underLine) {
    return null;
  }

  const moneylineHome  = homeH2h.price;
  const moneylineAway  = awayH2h.price;
  const spreadLine     = homeSpread.point ?? 0;
  const spreadHomeOdds = homeSpread.price;
  const spreadAwayOdds = awaySpread.price;
  const overUnderLine  = overLine.point ?? 0;
  const overOdds       = overLine.price;
  const underOdds      = underLine.price;

  return {
    id: game.id,
    sport,
    homeTeam: game.home_team,
    awayTeam: game.away_team,
    commenceTime: game.commence_time,
    status: 'pending',
    moneylineHome,
    moneylineAway,
    spreadLine,
    spreadHomeOdds,
    spreadAwayOdds,
    overUnderLine,
    overOdds,
    underOdds,
    eventElos: buildEventElos(
      moneylineHome, moneylineAway,
      spreadHomeOdds, spreadAwayOdds,
      overOdds, underOdds,
    ),
  };
}

// ── Scores API types ──────────────────────────────────────────────────────────

type ScoreGame = {
  id: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
};

export type CompletedGame = {
  id: string;
  sport: Sport;
  homeScore: number;
  awayScore: number;
};

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchScores(sports: Sport[] = ['NBA', 'NFL', 'MLB']): Promise<CompletedGame[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error('ODDS_API_KEY not configured');

  const fetches = sports
    .filter((s): s is keyof typeof SPORT_KEYS => s in SPORT_KEYS)
    .flatMap((sport) => {
      const raw = SPORT_KEYS[sport]!;
      return (Array.isArray(raw) ? raw : [raw]).map(async (sportKey) => {
        const url = `${BASE_URL}/sports/${sportKey}/scores?apiKey=${apiKey}&daysFrom=3`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return [] as CompletedGame[];  // inactive tournament — skip silently

        const games: ScoreGame[] = await res.json();
        return games
          .filter((g) => g.completed && g.scores && g.scores.length >= 2)
          .map((g): CompletedGame | null => {
            const home = g.scores!.find((s) => s.name === g.home_team);
            const away = g.scores!.find((s) => s.name === g.away_team);
            if (!home || !away) return null;
            const homeScore = parseFloat(home.score);
            const awayScore = parseFloat(away.score);
            if (isNaN(homeScore) || isNaN(awayScore)) return null;
            return { id: g.id, sport, homeScore, awayScore };
          })
          .filter((g): g is CompletedGame => g !== null);
      });
    });

  const results = await Promise.allSettled(fetches);
  return results.flatMap((r) => {
    if (r.status === 'rejected') console.warn('[scores] fetch failed:', (r.reason as Error).message);
    return r.status === 'fulfilled' ? r.value : [];
  });
}

export async function fetchOdds(sports: Sport[] = ['NBA', 'NFL', 'MLB']): Promise<Match[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error('ODDS_API_KEY not configured');

  const fetches = sports
    .filter((s): s is keyof typeof SPORT_KEYS => s in SPORT_KEYS)
    .flatMap((sport) => {
      const raw = SPORT_KEYS[sport]!;
      return (Array.isArray(raw) ? raw : [raw]).map(async (sportKey) => {
        const url =
          `${BASE_URL}/sports/${sportKey}/odds` +
          `?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;

        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return [] as Match[];  // inactive tournament — skip silently

        const games: OddsGame[] = await res.json();
        return games.map(g => transformGame(g, sport)).filter((m): m is Match => m !== null);
      });
    });

  const results = await Promise.allSettled(fetches);
  return results.flatMap(r => {
    if (r.status === 'rejected') console.warn('[odds] fetch failed:', (r.reason as Error).message);
    return r.status === 'fulfilled' ? r.value : [];
  });
}

// types/index.ts

export type Sport = 'NBA' | 'NFL' | 'MLB' | 'NCAA' | 'EPL' | 'LALIGA' | 'BUNDESLIGA' | 'SERIEA' | 'WORLDCUP' | 'TENNIS';
export type BetType = 'moneyline' | 'over_under' | 'spread';
export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type PickOutcome = 'win' | 'loss' | 'push' | 'pending' | 'cancelled' | 'void';
export type PickSide = 'home' | 'away' | 'over' | 'under';

// What a game looks like
export type Match = {
  id: string;
  sport: Sport;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;       // "7:30 PM ET"
  status: 'pending' | 'live' | 'completed';

  // Vegas odds (American format, e.g. -165, +140)
  moneylineHome: number;
  moneylineAway: number;
  spreadLine: number;         // e.g. -3.5 means home favored by 3.5
  spreadHomeOdds: number;
  spreadAwayOdds: number;
  overUnderLine: number;      // e.g. 227.5
  overOdds: number;
  underOdds: number;

  // Derived (calculated from the odds above)
  eventElos: {
    moneylineHome: number;
    moneylineAway: number;
    over: number;
    under: number;
    spreadHome: number;
    spreadAway: number;
  };

  // Final scores (only filled after game ends)
  homeScore?: number;
  awayScore?: number;
};

// What a pick looks like — named UserPick to avoid collision with TS built-in Pick<T,K>
export type UserPick = {
  id: string;
  matchId: string;
  sport?: Sport;              // which sport this pick belongs to (optional for legacy DB rows)
  gameTime?: string;          // ISO commence time of the game (for pending picks display)
  matchDescription: string;   // "Lakers vs Warriors"
  betType: BetType;
  pickSide: PickSide;
  confidenceLevel: ConfidenceLevel;
  spreadLine?: number;     // home team's spread at time of pick (e.g. -3.5)
  overUnderLine?: number;  // total points line at time of pick (e.g. 227.5)
  userEloAtPick: number;
  eventElo: number;
  projectedGain: number;
  projectedLoss: number;
  outcome: PickOutcome;
  eloDelta: number | null;    // null until resolved
  xpEarned: number;
  placedAt: string;
  resolvedAt?: string | null; // set when the pick settles
};

// What the user looks like (fake user for Phase 0)
export type User = {
  id: string;
  username: string;
  globalElo: number;
  seasonElo: number;
  sportElos: Partial<Record<Sport, number>>;  // per-sport Elo ratings
  xpTotal: number;
  totalPicks: number;
  weeksActive: number;
  picks: UserPick[];
  lastPickDate: string | null;  // ISO date (YYYY-MM-DD), tracks first_daily XP
  currentStreak: number;        // consecutive days with at least one pick
};

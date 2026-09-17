// Maps a Supabase `matches` row to the client Match type. Shared by every
// page that reads matches so new columns only need mapping once.

import { Match, Sport } from '@/types';

export function rowToMatch(row: Record<string, unknown>): Match {
  return {
    id:             row.id as string,
    sport:          row.sport as Sport,
    homeTeam:       row.home_team as string,
    awayTeam:       row.away_team as string,
    commenceTime:   row.commence_time as string,
    status:         row.status as Match['status'],
    moneylineHome:  row.moneyline_home as number,
    moneylineAway:  row.moneyline_away as number,
    spreadLine:     Number(row.spread_line),
    spreadHomeOdds: row.spread_home_odds as number,
    spreadAwayOdds: row.spread_away_odds as number,
    overUnderLine:  Number(row.over_under_line),
    overOdds:       row.over_odds as number,
    underOdds:      row.under_odds as number,
    eventElos: {
      moneylineHome: row.event_elo_ml_home as number,
      moneylineAway: row.event_elo_ml_away as number,
      over:          row.event_elo_over as number,
      under:         row.event_elo_under as number,
      spreadHome:    row.event_elo_sp_home as number,
      spreadAway:    row.event_elo_sp_away as number,
    },
    // ESPN enrichment (nullable columns; undefined when the migration hasn't
    // run yet or no ESPN match was found)
    homeRecord: (row.home_record as string | null) ?? undefined,
    awayRecord: (row.away_record as string | null) ?? undefined,
    venue:      (row.venue as string | null) ?? undefined,
    broadcast:  (row.broadcast as string | null) ?? undefined,
  };
}

import { createAdminClient } from '@/lib/supabase';
import MoneylineGrid from '@/components/MoneylineGrid';
import { Match, Sport } from '@/types';

function rowToMatch(row: Record<string, unknown>): Match {
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
  };
}

export default async function HomePage() {
  const admin = createAdminClient();
  const from  = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const to    = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from('matches')
    .select('*')
    .gte('commence_time', from)
    .lte('commence_time', to)
    .order('commence_time', { ascending: true });

  if (error) console.warn('[HomePage] Supabase error:', error.message);

  const matches = (data ?? []).map(rowToMatch);

  return <MoneylineGrid matches={matches} />;
}

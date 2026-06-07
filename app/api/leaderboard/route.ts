import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

const SPORT_COLUMN: Record<string, string> = {
  global: 'global_elo',
  nba:    'nba_elo',
  nfl:    'nfl_elo',
  mlb:    'mlb_elo',
  ncaa:   'ncaa_elo',
};

export async function GET(req: NextRequest) {
  const sport  = (req.nextUrl.searchParams.get('sport') ?? 'global').toLowerCase();
  const column = SPORT_COLUMN[sport] ?? 'global_elo';

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    .select(`id, username, global_elo, season_elo, nba_elo, nfl_elo, mlb_elo, ncaa_elo, total_picks, current_streak`)
    .order(column, { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users: data ?? [], sport, column });
}

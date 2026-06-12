import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';

const SPORT_COLUMN: Record<string, string> = {
  global: 'global_elo',
  nba:    'nba_elo',
  nfl:    'nfl_elo',
  mlb:    'mlb_elo',
  soccer: 'soccer_elo',
  tennis: 'tennis_elo',
};

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sport  = (req.nextUrl.searchParams.get('sport') ?? 'global').toLowerCase();
  const column = SPORT_COLUMN[sport] ?? 'global_elo';

  const admin = createAdminClient();

  const [{ data, error }, { data: me }] = await Promise.all([
    admin
      .from('users')
      .select('id, username, global_elo, season_elo, nba_elo, nfl_elo, mlb_elo, soccer_elo, tennis_elo, total_picks, current_streak')
      .gt('total_picks', 0)
      .order(column, { ascending: false })
      .limit(50),
    admin.from('users').select('id').eq('clerk_id', clerkId).single(),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users: data ?? [], sport, column, myId: me?.id ?? null });
}

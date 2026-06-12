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

  const rows = data ?? [];

  // W–L record + Elo movement over the last 7 days for everyone on the board
  const stats = new Map<string, { wins: number; losses: number; weekly: number }>();
  if (rows.length > 0) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: picks } = await admin
      .from('user_picks')
      .select('user_id, outcome, elo_delta, resolved_at')
      .in('user_id', rows.map((r) => r.id))
      .in('outcome', ['win', 'loss']);

    for (const p of picks ?? []) {
      const uid = p.user_id as string;
      if (!stats.has(uid)) stats.set(uid, { wins: 0, losses: 0, weekly: 0 });
      const s = stats.get(uid)!;
      if (p.outcome === 'win') s.wins++; else s.losses++;
      if (p.resolved_at && p.resolved_at > weekAgo) s.weekly += (p.elo_delta as number) ?? 0;
    }
  }

  const users = rows.map((r) => {
    const s = stats.get(r.id as string);
    return { ...r, wins: s?.wins ?? 0, losses: s?.losses ?? 0, weekly_delta: s?.weekly ?? 0 };
  });

  return NextResponse.json({ users, sport, column, myId: me?.id ?? null });
}

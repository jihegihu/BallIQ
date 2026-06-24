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

const USER_COLS = 'id, username, global_elo, season_elo, nba_elo, nfl_elo, mlb_elo, soccer_elo, tennis_elo, total_picks, current_streak';

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sport  = (req.nextUrl.searchParams.get('sport') ?? 'global').toLowerCase();
  const scope  = (req.nextUrl.searchParams.get('scope') ?? 'global').toLowerCase();
  const column = SPORT_COLUMN[sport] ?? 'global_elo';

  const admin = createAdminClient();

  // Need my own id up front for the "you" highlight and the friends scope.
  const { data: me } = await admin.from('users').select('id').eq('clerk_id', clerkId).single();
  const myId = me?.id as string | undefined;

  let data: Record<string, unknown>[] | null;
  let error: { message: string } | null;

  if (scope === 'friends') {
    // Me + everyone I follow, ranked by the selected sport (no min-picks filter
    // so friends still show even before they've made a pick).
    const { data: follows } = myId
      ? await admin.from('follows').select('followee_id').eq('follower_id', myId)
      : { data: [] as { followee_id: string }[] };
    const ids = [...new Set([...(myId ? [myId] : []), ...(follows ?? []).map((f) => f.followee_id as string)])];

    ({ data, error } = ids.length > 0
      ? await admin.from('users').select(USER_COLS).in('id', ids).order(column, { ascending: false }).limit(50)
      : { data: [], error: null });
  } else {
    ({ data, error } = await admin
      .from('users')
      .select(USER_COLS)
      .gt('total_picks', 0)
      .order(column, { ascending: false })
      .limit(50));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  // W–L record + Elo movement over the last 7 days for everyone on the board
  const stats = new Map<string, { wins: number; losses: number; weekly: number }>();
  if (rows.length > 0) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: picks } = await admin
      .from('user_picks')
      .select('user_id, outcome, elo_delta, resolved_at')
      .in('user_id', rows.map((r) => r.id as string))
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

  return NextResponse.json({ users, sport, column, scope, myId: myId ?? null });
}

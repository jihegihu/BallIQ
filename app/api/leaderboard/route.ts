import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';
import { TIERS } from '@/lib/tiers';

const SPORT_COLUMN: Record<string, string> = {
  global: 'global_elo',
  nba:    'nba_elo',
  nfl:    'nfl_elo',
  mlb:    'mlb_elo',
  soccer: 'soccer_elo',
  tennis: 'tennis_elo',
};

// The leagues behind each sport board. Soccer is one rating across five.
const SPORT_FAMILY: Record<string, string[]> = {
  nba:    ['NBA'],
  nfl:    ['NFL'],
  mlb:    ['MLB'],
  soccer: ['EPL', 'LALIGA', 'BUNDESLIGA', 'SERIEA', 'WORLDCUP'],
  tennis: ['TENNIS'],
};

const USER_COLS = 'id, username, global_elo, season_elo, nba_elo, nfl_elo, mlb_elo, soccer_elo, tennis_elo, total_picks, current_streak';

type Admin = ReturnType<typeof createAdminClient>;
type PickRow = { user_id: string; outcome: string; elo_delta: number | null; resolved_at: string | null };

// The database returns at most 1,000 rows per request, and a query that hits
// that line is cut off without any error. Both readers below page through
// instead. MAX_PAGES is a backstop, not a design limit.
const PAGE = 1000;
const MAX_PAGES = 20;

/**
 * Every decided pick matching a filter.
 *
 * Read in one go this stopped at 1,000 rows, so once there were more decided
 * picks than that the records on the board undercounted silently.
 *
 * Scaling note: with `sports` and no `userIds` this reads every decided pick
 * in a sport just to learn who has played it. Fine in the thousands; past
 * that it wants a small SQL function returning the distinct user ids.
 */
async function decidedPicks(
  admin: Admin,
  filter: { userIds?: string[]; sports?: string[] },
): Promise<PickRow[]> {
  const out: PickRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = admin
      .from('user_picks')
      .select('user_id, outcome, elo_delta, resolved_at')
      .in('outcome', ['win', 'loss']);
    if (filter.userIds) q = q.in('user_id', filter.userIds);
    if (filter.sports)  q = q.in('sport', filter.sports);
    const { data } = await q.order('id', { ascending: true }).range(page * PAGE, page * PAGE + PAGE - 1);
    const rows = (data ?? []) as PickRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Every rated account's id and its rating in one column. */
async function ratedPlayers(admin: Admin, column: string): Promise<{ id: string; elo: number }[]> {
  const out: { id: string; elo: number }[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await admin
      .from('users')
      .select(`id, ${column}`)
      .gt('total_picks', 0)
      .order('id', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    // Supabase types a dynamic-column select loosely, so narrow it once here.
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    for (const r of rows) {
      if (typeof r[column] === 'number') out.push({ id: r.id as string, elo: r[column] as number });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sport  = (req.nextUrl.searchParams.get('sport') ?? 'global').toLowerCase();
  const scope  = (req.nextUrl.searchParams.get('scope') ?? 'global').toLowerCase();
  const column = SPORT_COLUMN[sport] ?? 'global_elo';
  const family = SPORT_FAMILY[sport];

  const admin = createAdminClient();

  // Need my own id up front for the "you" highlight and the friends scope.
  const { data: me } = await admin.from('users').select('id').eq('clerk_id', clerkId).single();
  const myId = me?.id as string | undefined;

  // ── Who counts ──────────────────────────────────────────────────────────
  // Everyone has a rating in every sport from the day they sign up, whether
  // or not they have ever picked it. Ranking on that alone filled each sport
  // board with people parked on the starting number and made "rank 3 of 40"
  // mean nothing. A sport's board and ladder are for people who have had a
  // pick decided in that sport; the global board is every rated account.
  const [rated, sportPicks] = await Promise.all([
    ratedPlayers(admin, column),
    family ? decidedPicks(admin, { sports: family }) : Promise.resolve(null),
  ]);
  const played = sportPicks ? new Set(sportPicks.map((p) => p.user_id)) : null;
  const field  = played ? rated.filter((r) => played.has(r.id)) : rated;
  const elos   = field.map((r) => r.elo);

  // ── The board ───────────────────────────────────────────────────────────
  let boardIds: string[];
  if (scope === 'friends') {
    // Me + everyone I follow, ranked by the selected sport. No restriction to
    // people who have played it: these are your friends, shown regardless.
    const { data: follows } = myId
      ? await admin.from('follows').select('followee_id').eq('follower_id', myId)
      : { data: [] as { followee_id: string }[] };
    boardIds = [...new Set([...(myId ? [myId] : []), ...(follows ?? []).map((f) => f.followee_id as string)])];
  } else {
    boardIds = [...field].sort((a, b) => b.elo - a.elo).slice(0, 50).map((r) => r.id);
  }

  const { data, error } = boardIds.length > 0
    ? await admin.from('users').select(USER_COLS).in('id', boardIds).order(column, { ascending: false }).limit(50)
    : { data: [] as Record<string, unknown>[], error: null };
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Record<string, unknown>[];

  // W–L record + Elo movement over the last 7 days for everyone on the board.
  // On a sport board the record is that sport's, to match the rating beside it.
  const stats = new Map<string, { wins: number; losses: number; weekly: number }>();
  if (rows.length > 0) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const onBoard = new Set(rows.map((r) => r.id as string));
    const picks = sportPicks
      ? sportPicks.filter((p) => onBoard.has(p.user_id))          // already loaded
      : await decidedPicks(admin, { userIds: [...onBoard] });

    for (const p of picks) {
      if (!stats.has(p.user_id)) stats.set(p.user_id, { wins: 0, losses: 0, weekly: 0 });
      const s = stats.get(p.user_id)!;
      if (p.outcome === 'win') s.wins++; else s.losses++;
      if (p.resolved_at && p.resolved_at > weekAgo) s.weekly += p.elo_delta ?? 0;
    }
  }

  const users = rows.map((r) => {
    const s = stats.get(r.id as string);
    return { ...r, wins: s?.wins ?? 0, losses: s?.losses ?? 0, weekly_delta: s?.weekly ?? 0 };
  });

  // ── Standing ────────────────────────────────────────────────────────────
  // How the field is spread across the ladder, plus where the viewer sits in
  // it. The board only ever shows the top 50, so without this a user outside
  // that has no way to tell whether they are near the top or the bottom.
  //
  // The viewer has a place only if they are in the field: rated, and on a
  // sport ladder, someone who has played that sport.
  const myElo = field.find((r) => r.id === myId)?.elo;

  const distribution = TIERS.map((t, i) => ({
    label: t.label,
    min:   t.min,
    max:   i === 0 ? null : TIERS[i - 1].min,
    count: elos.filter((e) => e >= t.min && (i === 0 || e < TIERS[i - 1].min)).length,
  }));

  // Share of OTHER players below this user. Counting yourself in your own
  // denominator made the top player "ahead of 100%", which is both wrong and
  // the kind of thing people notice.
  let percentile: number | null = null;
  let ahead = 0;
  let rank: number | null = null;
  if (myElo != null && elos.length > 1) {
    ahead = field.filter((r) => r.id !== myId && r.elo < myElo).length;
    percentile = Math.round((ahead / (elos.length - 1)) * 100);
    // Standard competition rank: everyone strictly above you, plus one. Ties
    // therefore share a rank rather than being ordered arbitrarily.
    rank = elos.filter((e) => e > myElo).length + 1;
  }

  return NextResponse.json({
    users, sport, column, scope,
    myId: myId ?? null,
    standing: { myElo: myElo ?? null, percentile, ahead, rank, totalRated: elos.length, distribution },
  });
}

// GET /api/share/card?kind=rank
// GET /api/share/card?kind=pool&id=<pool id>
//
// A PNG of the signed-in user's rating, or of how a settled pool went for
// them. Every number on it is read from the database for the caller — nothing
// comes from the query string — so a card cannot be made to claim a rank or a
// win its owner does not have.

import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { rankCard, poolCard, CARD_SIZE } from '@/lib/shareCard';
import { UUID_RE } from '@/lib/invite';

const png = (el: React.ReactElement) =>
  new ImageResponse(el, {
    width: CARD_SIZE,
    height: CARD_SIZE,
    // Personal and changing: never to be cached and served to someone else.
    headers: { 'Cache-Control': 'private, no-store' },
  });

export async function GET(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url  = new URL(req.url);
  const kind = url.searchParams.get('kind');

  const admin = createAdminClient();
  const me    = await getOrCreateUser(clerkId);

  const { data: user } = await admin
    .from('users').select('username, global_elo, total_picks').eq('id', me).single();
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const username = (user.username as string) ?? 'Player';

  if (kind === 'rank') {
    const elo = user.global_elo as number;
    const rated = (user.total_picks as number) > 0;
    const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);

    const [above, total, wins, losses] = await Promise.all([
      count(admin.from('users').select('id', { count: 'exact', head: true }).gt('total_picks', 0).gt('global_elo', elo)),
      count(admin.from('users').select('id', { count: 'exact', head: true }).gt('total_picks', 0)),
      count(admin.from('user_picks').select('id', { count: 'exact', head: true }).eq('user_id', me).eq('outcome', 'win')),
      count(admin.from('user_picks').select('id', { count: 'exact', head: true }).eq('user_id', me).eq('outcome', 'loss')),
    ]);

    return png(rankCard({
      username, elo,
      // Same rule as the rankings: everyone strictly above you, plus one.
      rank: rated ? above + 1 : null,
      totalRated: total,
      wins, losses,
    }));
  }

  if (kind === 'pool') {
    const id = url.searchParams.get('id') ?? '';
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [{ data: pool }, { data: member }, { count: games }, { count: players }] = await Promise.all([
      admin.from('pools').select('title, stake, status').eq('id', id).maybeSingle(),
      admin.from('pool_members').select('status, correct, elo_delta').eq('pool_id', id).eq('user_id', me).maybeSingle(),
      admin.from('pool_matches').select('match_id', { count: 'exact', head: true }).eq('pool_id', id),
      admin.from('pool_members').select('user_id', { count: 'exact', head: true }).eq('pool_id', id).eq('status', 'joined'),
    ]);

    // Only a finished pool the caller actually played in has a result to show.
    if (!pool || pool.status !== 'settled' || !member || member.status !== 'joined') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return png(poolCard({
      username,
      title: pool.title as string,
      delta: (member.elo_delta as number | null) ?? 0,
      correct: (member.correct as number | null) ?? 0,
      games: games ?? 0,
      players: players ?? 0,
      stake: pool.stake as number,
    }));
  }

  return NextResponse.json({ error: 'Unknown card' }, { status: 400 });
}

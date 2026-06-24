// GET    /api/friends            — list the players the current user follows
// POST   /api/friends            — follow a player by username  { username }
// DELETE /api/friends?userId=...  — unfollow a player

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';
import { getOrCreateUser } from '@/lib/getOrCreateUser';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const me    = await getOrCreateUser(clerkId);

  const { data: rows } = await admin.from('follows').select('followee_id').eq('follower_id', me);
  const ids = (rows ?? []).map((r) => r.followee_id as string);

  const { data: friends } = ids.length > 0
    ? await admin.from('users').select('id, username, global_elo').in('id', ids)
    : { data: [] as { id: string; username: string; global_elo: number }[] };

  return NextResponse.json({ friends: friends ?? [] });
}

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { username } = await req.json().catch(() => ({})) as { username?: string };
  const name = username?.trim();
  if (!name) return NextResponse.json({ added: false, reason: 'Enter a username' }, { status: 400 });

  const admin = createAdminClient();
  const me    = await getOrCreateUser(clerkId);

  // Case-insensitive exact match. limit(1) avoids erroring if two usernames
  // differ only by case (the unique constraint is case-sensitive).
  const { data: matches } = await admin
    .from('users')
    .select('id, username')
    .ilike('username', name)
    .limit(1);
  const target = matches?.[0];

  if (!target)        return NextResponse.json({ added: false, reason: `No player named "${name}"` }, { status: 404 });
  if (target.id === me) return NextResponse.json({ added: false, reason: "That's you!" }, { status: 400 });

  const { error } = await admin
    .from('follows')
    .upsert({ follower_id: me, followee_id: target.id }, { onConflict: 'follower_id,followee_id', ignoreDuplicates: true });

  if (error) return NextResponse.json({ added: false, reason: error.message }, { status: 500 });

  return NextResponse.json({ added: true, friend: { id: target.id, username: target.username } });
}

export async function DELETE(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const admin = createAdminClient();
  const me    = await getOrCreateUser(clerkId);

  await admin.from('follows').delete().eq('follower_id', me).eq('followee_id', userId);

  return NextResponse.json({ removed: true });
}

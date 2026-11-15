// POST /api/invite  { inviterId } — the signed-in user arrived through
// someone's invite link. Make the two of them friends.
//
// Both directions are added. Following is one-way everywhere else in the app,
// but an invite is the one case where both sides have plainly asked for it:
// one sent the link and the other opened it. It also has to be mutual to be
// useful, because pool invitations only go to people you follow.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { UUID_RE } from '@/lib/invite';

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { inviterId } = await req.json().catch(() => ({})) as { inviterId?: unknown };
  if (typeof inviterId !== 'string' || !UUID_RE.test(inviterId)) {
    return NextResponse.json({ ok: false, error: 'Bad invite' }, { status: 400 });
  }

  const admin = createAdminClient();
  const me    = await getOrCreateUser(clerkId);
  // Opening your own link is not an invite.
  if (inviterId === me) return NextResponse.json({ ok: false, error: 'Own link' }, { status: 400 });

  const { data: inviter } = await admin.from('users').select('id, username').eq('id', inviterId).maybeSingle();
  if (!inviter) return NextResponse.json({ ok: false, error: 'Unknown inviter' }, { status: 404 });

  const { error } = await admin.from('follows').upsert(
    [
      { follower_id: me, followee_id: inviterId },
      { follower_id: inviterId, followee_id: me },
    ],
    { onConflict: 'follower_id,followee_id', ignoreDuplicates: true },
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, username: inviter.username });
}

// Notification preferences for the signed-in user.
//
//   GET   /api/notify/prefs                        -> { enabled: boolean }
//   PATCH /api/notify/prefs  { enabled: boolean }  -> { enabled: boolean }
//
// One master switch for now. It lives on `users`, not on push_tokens, because
// turning notifications off is a decision about the account rather than about
// one handset — switch it off on your phone and your tablet goes quiet too.
//
// /api/notify checks this before doing any per-user work, so an opted-out
// account costs nothing on a cron tick.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';
import { getOrCreateUser } from '@/lib/getOrCreateUser';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const me    = await getOrCreateUser(clerkId);

  const { data, error } = await admin
    .from('users').select('notifications_enabled').eq('id', me).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Default on for rows written before the column existed.
  return NextResponse.json({ enabled: data?.notifications_enabled !== false });
}

export async function PATCH(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { enabled } = await req.json().catch(() => ({})) as { enabled?: unknown };
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
  }

  const admin = createAdminClient();
  const me    = await getOrCreateUser(clerkId);

  const { error } = await admin
    .from('users').update({ notifications_enabled: enabled }).eq('id', me);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ enabled });
}

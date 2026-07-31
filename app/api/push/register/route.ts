// POST /api/push/register — store an APNs device token for the current user.
// Called by the native shell after the OS grants push permission. Body:
//   { token: string, platform?: 'ios' | 'android' }

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';
import { getOrCreateUser } from '@/lib/getOrCreateUser';

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token, platform } = await req.json().catch(() => ({})) as {
    token?: string; platform?: string;
  };
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const me    = await getOrCreateUser(clerkId);

  // token is the primary key — re-registering the same device (or moving it to
  // a new account) overwrites the owner rather than erroring.
  const { error } = await admin.from('push_tokens').upsert(
    { token, user_id: me, platform: platform ?? 'ios', updated_at: new Date().toISOString() },
    { onConflict: 'token' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ registered: true });
}

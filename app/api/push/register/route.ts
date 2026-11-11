// Device token registration for push notifications.
//
//   POST   /api/push/register  { token, platform? }  — claim this device
//   DELETE /api/push/register  { token }             — release this device

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';
import { getOrCreateUser } from '@/lib/getOrCreateUser';

function validTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token, platform, timezone } = await req.json().catch(() => ({})) as {
    token?: string; platform?: string; timezone?: string;
  };
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const me    = await getOrCreateUser(clerkId);

  // token is the primary key — re-registering the same device (or moving it to
  // a new account) overwrites the owner rather than erroring.
  const { error } = await admin.from('push_tokens').upsert(
    {
      token,
      user_id: me,
      platform: platform ?? 'ios',
      // Drives when the daily notifications land (lib/notifyWindow.ts). Client
      // input, so it is validated rather than trusted: a bogus zone would make
      // Intl throw inside the cron and take the whole run down with it. null
      // falls back to Eastern.
      timezone: validTimezone(timezone) ? timezone : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'token' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ registered: true });
}

/**
 * Forget a device, so it stops receiving notifications.
 *
 * Deliberately does NOT require a session. This is the sign-out path, and
 * requiring auth here is what made the bug it fixes unfixable: the request
 * races Clerk tearing the session down, and the retry on the next launch has
 * no session at all. A signed-out app must be able to say "stop sending to
 * me" — that is the whole point.
 *
 * Safe without auth because the device token *is* the credential. It is a
 * 64-hex-char secret issued by Apple to one install of one app, it is never
 * displayed or shared, and holding it grants exactly one power: silencing the
 * device that holds it. There is nothing to read back and nothing to escalate
 * to — a guessed token could at worst stop its own owner's notifications,
 * which the owner can undo by relaunching the app.
 */
export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({})) as { token?: string };
  // Accept the token in the query string too, so a beacon-style request on
  // app teardown (which cannot always carry a body) still works.
  const token = body.token ?? new URL(req.url).searchParams.get('token') ?? undefined;

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('push_tokens').delete().eq('token', token);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Idempotent: deleting a token that was already gone is a success, so a
  // retry from a flaky connection never reports a spurious failure.
  return NextResponse.json({ unregistered: true });
}

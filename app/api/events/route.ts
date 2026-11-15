// POST /api/events  { name, props? } — record one analytics event for the
// signed-in user. See lib/events.ts for the list of names.
//
// Always answers 200. A failed insert (including the table not existing
// before migration-010 is run) is not something the app should react to or
// log an error about; it is reported in the body and otherwise ignored.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { isEventName } from '@/lib/events';

/** Props are a few short labels, never a payload. */
const MAX_PROPS_CHARS = 300;

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { name?: unknown; props?: unknown };
  if (!isEventName(body.name)) return NextResponse.json({ ok: false, error: 'unknown event' }, { status: 400 });

  // Only a flat object of primitives is kept; anything else is dropped rather
  // than stored, so this cannot become a place to stash arbitrary data.
  let props: Record<string, string | number | boolean | null> | null = null;
  if (body.props && typeof body.props === 'object' && !Array.isArray(body.props)) {
    const flat: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(body.props as Record<string, unknown>)) {
      if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') flat[k.slice(0, 40)] = v;
    }
    if (JSON.stringify(flat).length <= MAX_PROPS_CHARS && Object.keys(flat).length > 0) props = flat;
  }

  const admin = createAdminClient();
  const me    = await getOrCreateUser(clerkId);

  const { error } = await admin.from('events').insert({ user_id: me, name: body.name, props });
  return NextResponse.json({ ok: !error });
}

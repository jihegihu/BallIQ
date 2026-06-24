// DELETE /api/account — permanently delete the signed-in user's account.
// Required by the App Store (any app with account creation must offer in-app
// account deletion). Removes their data, then their Clerk identity.

import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase';

export async function DELETE() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Delete app data first. Deleting the users row cascades to user_picks,
  // follows, xp_events, etc. (all FK'd ON DELETE CASCADE). Doing this before
  // the Clerk delete means a partial failure can't leave an auth account with
  // no data — at worst the user logs back in and a fresh empty row is created.
  const { data: u } = await admin.from('users').select('id').eq('clerk_id', clerkId).single();
  if (u?.id) {
    const { error } = await admin.from('users').delete().eq('id', u.id as string);
    if (error) return NextResponse.json({ deleted: false, reason: error.message }, { status: 500 });
  }

  // Remove the Clerk identity last so the login itself is gone.
  try {
    const client = await clerkClient();
    await client.users.deleteUser(clerkId);
  } catch (e) {
    return NextResponse.json({ deleted: false, reason: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}

// Server-side only. Looks up a user row by their Clerk ID, creating one if absent.
// Returns the internal UUID used as the PK in user_picks.

import { createAdminClient } from './supabase';

export async function getOrCreateUser(
  clerkId: string,
  username?: string,
): Promise<string> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('users')
    .select('id')
    .eq('clerk_id', clerkId)
    .single();

  if (existing?.id) {
    if (username) {
      await admin.from('users').update({ username }).eq('clerk_id', clerkId);
    }
    return existing.id as string;
  }

  const { data: created, error } = await admin
    .from('users')
    .insert({
      clerk_id:       clerkId,
      username:       username ?? 'Player',
      global_elo:     1200,
      season_elo:     1200,
      xp_total:       0,
      total_picks:    0,
      weeks_active:   1,
      current_streak: 0,
      last_pick_date: null,
      nba_elo:        1200,
      nfl_elo:        1200,
      mlb_elo:        1200,
      ncaa_elo:       1200,
      soccer_elo:     1200,
      tennis_elo:     1200,
    })
    .select('id')
    .single();

  if (error || !created?.id) throw new Error(`Failed to create user: ${error?.message}`);
  return created.id as string;
}

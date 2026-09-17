import { createAdminClient } from '@/lib/supabase';
import MoneylineGrid from '@/components/MoneylineGrid';
import { rowToMatch } from '@/lib/matchRow';

// Without this the page is statically prerendered at build time and the games
// list (and its time-window filter) is frozen at whatever existed at deploy.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const admin = createAdminClient();
  const from  = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  // Only surface games kicking off within the next 36 hours — keeps the board
  // focused on what's imminent (applies to every sport, World Cup included).
  const to    = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from('matches')
    .select('*')
    .gte('commence_time', from)
    .lte('commence_time', to)
    .order('commence_time', { ascending: true });

  if (error) console.warn('[HomePage] Supabase error:', error.message);

  const matches = (data ?? []).map(rowToMatch);

  return <MoneylineGrid matches={matches} />;
}

import { createAdminClient } from '@/lib/supabase';
import MoneylineGrid from '@/components/MoneylineGrid';
import { rowToMatch } from '@/lib/matchRow';

// Without this the page is statically prerendered at build time and the games
// list (and its time-window filter) is frozen at whatever existed at deploy.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const admin = createAdminClient();

  // The board aims at the next 36 hours — close enough that everything on it
  // is worth acting on now. But on a quiet midweek evening that window can be
  // genuinely empty (measured: zero games, with 200 perfectly good fixtures
  // sitting just past the cutoff), and an empty board reads as a broken app.
  //
  // So 36 hours is a preference, not a hard edge: if it yields fewer than
  // MIN_GAMES the board reaches further out, in kick-off order, until it has
  // enough. Quiet days borrow from the days after them; busy days are
  // unaffected and stay tightly scoped.
  const PREFERRED_HOURS = 36;
  const MIN_GAMES       = 25;
  const MAX_REACH_DAYS  = 14;   // hard stop, so the board can never run away

  // Lookback covers games already under way so they can show as Live. Four
  // hours clears an NFL game; shorter and a game in its final quarter would
  // drop off the board entirely.
  const from = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const to   = new Date(Date.now() + MAX_REACH_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // One query for the widest case, then trimmed in memory — cheaper than
  // widening the window over repeated round trips.
  const { data, error } = await admin
    .from('matches')
    .select('*')
    .gte('commence_time', from)
    .lte('commence_time', to)
    .order('commence_time', { ascending: true });

  if (error) console.warn('[HomePage] Supabase error:', error.message);

  const all = (data ?? []).map(rowToMatch);

  // The minimum counts PICKABLE games only. Games already under way show in
  // the live rail but can't be picked, so letting them pad the count could
  // still leave a board with nothing to do on it.
  const now      = Date.now();
  const started  = all.filter((m) => new Date(m.commenceTime).getTime() <= now);
  const upcoming = all.filter((m) => new Date(m.commenceTime).getTime() > now);

  const preferredCutoff = now + PREFERRED_HOURS * 60 * 60 * 1000;
  const withinPreferred = upcoming.filter((m) => new Date(m.commenceTime).getTime() <= preferredCutoff);

  // `upcoming` is in kick-off order and shares its opening run with
  // `withinPreferred`, so slicing it extends the window by the fewest games
  // needed. If even 14 days can't reach MIN_GAMES, show everything there is.
  const chosen = withinPreferred.length >= MIN_GAMES
    ? withinPreferred
    : upcoming.slice(0, MIN_GAMES);

  return <MoneylineGrid matches={[...started, ...chosen]} />;
}

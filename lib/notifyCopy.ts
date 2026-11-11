// The words that actually reach a lock screen.
//
// Separated from the route so the strings can be read and tested on their own
// — the first version shipped "Tonight: Cavaliers at Knicks" for a game 19
// hours away, which nobody caught because the copy was buried inside a handler
// that needed a database to run.
//
// Two rules the text follows:
//
//   1. No odds, no percentages. The notification sells the Elo on offer and
//      asks for a pick; working out who is likely to win is the point of
//      opening the app, not something to give away on the lock screen.
//   2. Never claim a day it cannot keep. The reminder window is evening local
//      and the horizon runs 18 hours, so plenty of candidates are tomorrow's
//      games. Those say "tomorrow".

export type Message = { title: string; body: string };

/**
 * Time of day in the device's zone, e.g. "7:10 PM", plus whether that lands on
 * the viewer's today or tomorrow.
 */
function whenPhrase(commenceTime: string, zone: string, now: Date): string {
  const kick = new Date(commenceTime);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour: 'numeric', minute: '2-digit',
  }).format(kick);

  const dayOf = (d: Date) => new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);

  return dayOf(kick) === dayOf(now) ? `tips ${time}` : `tips tomorrow, ${time}`;
}

/**
 * The evening nudge.
 *
 * `maxGain` is the larger of the two sides' projected gains — what this pick is
 * worth at best, for this user's rating and K. "Up to" is doing real work: it
 * is honest that the favourite pays less, without printing the odds that say
 * by how much.
 */
export function bigGameMessage(opts: {
  matchup: string;
  maxGain: number;
  commenceTime: string;
  zone: string;
  now?: Date;
}): Message {
  const { matchup, maxGain, commenceTime, zone, now = new Date() } = opts;
  return {
    title: matchup,
    body: `Up to +${maxGain} Elo. Pick your winner — ${whenPhrase(commenceTime, zone, now)}.`,
  };
}

/**
 * Results, while they are still news.
 *
 * Deliberately not a copy of the digest. This one is about what just
 * happened — no rank, no standing, because those are the digest's job and
 * repeating them is what makes a stream of notifications feel like noise.
 *
 * A single settled pick gets named as such ("Your pick landed") since "1W-0L"
 * for one result reads like a box score of nothing.
 */
export function settledMessage(opts: {
  wins: number;
  losses: number;
  pushes: number;
  net: number;
}): Message {
  const { wins, losses, pushes, net } = opts;
  const decided = wins + losses;
  const sign = net >= 0 ? '+' : '';

  if (decided === 1 && pushes === 0) {
    return {
      title: wins === 1 ? 'Your pick landed' : 'That one got away',
      body:  `${sign}${net} Elo.`,
    };
  }

  const counted = [`${wins}W–${losses}L`];
  if (pushes > 0) counted.push(`${pushes} push${pushes > 1 ? 'es' : ''}`);

  return {
    title: `${sign}${net} Elo`,
    body:  `${counted.join(', ')} just settled.`,
  };
}

/**
 * The end-of-day digest.
 *
 * The title is the competitive news — where you moved globally — because that
 * is what this notification exists to do. Record and Elo are the supporting
 * line. Distance to the next tier is deliberately absent: it reads as a nag
 * every single night, and the ladder is already the whole of the rankings
 * screen.
 */
export function digestMessage(opts: {
  wins: number;
  losses: number;
  net: number;
  rank: number | null;
  prevRank: number | null;
  settledCount: number;
}): Message {
  const { wins, losses, net, rank, prevRank, settledCount } = opts;

  const moved = rank != null && prevRank != null && rank !== prevRank;
  const places = moved ? Math.abs((prevRank as number) - rank) : 0;
  const up = moved && rank < (prevRank as number);

  const title = moved
    // Lower rank number is better, so a smaller number is a climb.
    ? (up ? `Up ${places} to #${rank}` : `Down ${places} to #${rank}`)
    : rank != null
      ? `#${rank} overall`
      : `${net >= 0 ? '+' : ''}${net} Elo today`;

  // Rank can move without the user playing, when everyone else does. Saying
  // "0W-0L" there reads as a failure; naming it plainly is a better nudge.
  const body = settledCount === 0
    ? 'No picks settled today.'
    : `${wins}W–${losses}L today, ${net >= 0 ? '+' : ''}${net} Elo.`;

  return { title, body };
}

// When to send, in the user's own time.
//
// The cron fires hourly in UTC and this decides, per device, whether the local
// clock has reached a slot. Everything else in the app works in Eastern
// (lib/xp.ts), which is right for scoring a sports day but wrong for "good
// evening" — a 6pm Eastern nudge reaches California at 3pm, mid-afternoon, and
// an 11pm Eastern digest arrives there at 8pm with the games still on.

export type NotifyKind = 'big_game' | 'daily_digest' | 'settled';

/** How often the settled-picks push may fire, in hours. */
export const SETTLED_GAP_HOURS = 3;

/**
 * Local windows, as inclusive hour ranges on a 24h clock.
 *
 * Each daily slot is a RANGE rather than one hour because the cron ticks
 * hourly and can drift or miss a run; a window gives it more than one chance.
 * Firing twice is harmless — notification_log's key is (user, kind, day, slot),
 * so the first send of the day claims it.
 */
const WINDOWS: Record<NotifyKind, { from: number; to: number }> = {
  // After work, before the US evening slate tips off.
  big_game:     { from: 17, to: 19 },
  // Late enough that most of the day has settled. Not later: past midnight the
  // local day rolls over and the slot would be claimed for the wrong one.
  daily_digest: { from: 22, to: 23 },
  // Results, while they still feel like news.
  //
  // Starts at 10 and stops at 21 on purpose. Games on the west coast finish
  // after 1am Eastern, and settling them is not worth waking anyone for; those
  // results reach people in the morning bucket instead, or in the digest. The
  // upper bound leaves 22-23 to the digest so the two never land together.
  settled:      { from: 10, to: 21 },
};

/** Default for tokens registered before timezone capture existed. */
export const FALLBACK_TZ = 'America/New_York';

/**
 * The device's local hour (0-23) and calendar day (YYYY-MM-DD).
 *
 * Uses Intl rather than arithmetic on UTC offsets, so daylight saving is the
 * platform's problem rather than ours.
 */
export function localClock(timeZone: string | null | undefined, now = new Date()): {
  hour: number;
  day: string;
  zone: string;
} {
  const zone = validZone(timeZone) ? (timeZone as string) : FALLBACK_TZ;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  // en-CA gives YYYY-MM-DD ordering, and hour12:false renders midnight as "24"
  // on some engines, which would read as hour 24 and match no window.
  const hour = Number(get('hour')) % 24;
  return { hour, day: `${get('year')}-${get('month')}-${get('day')}`, zone };
}

/**
 * A timezone handed to us by a client is untrusted input, and an invalid one
 * makes Intl throw. Checking once here keeps a bad value from taking down a
 * whole cron run.
 */
function validZone(tz: string | null | undefined): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** A kind that is due, plus the ledger slot it should claim. */
export type DueSlot = { kind: NotifyKind; slot: number };

/**
 * Which slots this device's local clock is currently inside.
 *
 * The daily kinds always claim slot 0, so their key stays one-per-day. The
 * settled push claims its 3-hour bucket, which is what spaces it out: inside a
 * bucket the key is already taken, and the next bucket cannot start until the
 * gap has elapsed.
 */
export function dueKinds(timeZone: string | null | undefined, now = new Date()): {
  hour: number;
  day: string;
  zone: string;
  due: DueSlot[];
} {
  const { hour, day, zone } = localClock(timeZone, now);
  const due: DueSlot[] = [];
  for (const kind of Object.keys(WINDOWS) as NotifyKind[]) {
    const w = WINDOWS[kind];
    if (hour < w.from || hour > w.to) continue;
    due.push({ kind, slot: kind === 'settled' ? Math.floor(hour / SETTLED_GAP_HOURS) : 0 });
  }
  return { hour, day, zone, due };
}

/** How many settled pushes a day the current window and gap allow, at most. */
export function maxSettledPerDay(): number {
  const w = WINDOWS.settled;
  const buckets = new Set<number>();
  for (let h = w.from; h <= w.to; h++) buckets.add(Math.floor(h / SETTLED_GAP_HOURS));
  return buckets.size;
}

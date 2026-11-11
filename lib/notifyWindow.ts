// When to send, in the user's own time.
//
// The cron fires hourly in UTC and this decides, per device, whether the local
// clock has reached one of the two daily slots. Everything else in the app
// works in Eastern (lib/xp.ts), which is right for scoring a sports day but
// wrong for "good evening" — a 6pm Eastern nudge reaches California at 3pm,
// mid-afternoon, and an 11pm Eastern digest arrives there at 8pm with the games
// still on.

export type NotifyKind = 'big_game' | 'daily_digest';

/**
 * Local windows, as hours on a 24h clock.
 *
 * Each is a RANGE rather than a single hour because the cron ticks hourly and
 * can drift or miss a run; a window gives the slot more than one chance to be
 * caught. Firing twice is harmless — notification_log's primary key is
 * (user_id, kind, local_day), so the first send of the day claims the slot.
 */
const WINDOWS: Record<NotifyKind, { from: number; to: number }> = {
  // After work, before the US evening slate tips off.
  big_game:     { from: 17, to: 19 },
  // Late enough that most of the day has settled. Not later: past midnight the
  // local_day rolls over and the slot would be claimed for the wrong day.
  daily_digest: { from: 22, to: 23 },
};

/** Default for tokens registered before timezone capture existed. */
export const FALLBACK_TZ = 'America/New_York';

/**
 * The device's local hour (0-23) and calendar day (YYYY-MM-DD).
 *
 * Uses Intl rather than arithmetic on UTC offsets so daylight saving is the
 * platform's problem, not ours.
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
  // en-CA gives YYYY-MM-DD ordering, and hour12:false can render midnight as
  // "24" on some engines, which would read as hour 24 and match no window.
  const hour = Number(get('hour')) % 24;
  return { hour, day: `${get('year')}-${get('month')}-${get('day')}`, zone };
}

/**
 * A timezone string we were handed by a client is untrusted input, and an
 * invalid one makes Intl throw. Checking once here keeps a bad value from
 * taking down a whole cron run.
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

/** Which slot, if any, this device's local clock is currently inside. */
export function dueKinds(timeZone: string | null | undefined, now = new Date()): {
  hour: number;
  day: string;
  zone: string;
  due: NotifyKind[];
} {
  const { hour, day, zone } = localClock(timeZone, now);
  const due = (Object.keys(WINDOWS) as NotifyKind[])
    .filter((k) => hour >= WINDOWS[k].from && hour <= WINDOWS[k].to);
  return { hour, day, zone, due };
}

// Product analytics, first-party.
//
// Everything the app records about usage goes through track() and lands in
// our own `events` table. Keeping it to one function is deliberate: if this
// is ever moved to a hosted tool, that is a change to this file and nowhere
// else.
//
// The list of names is closed. The server refuses anything not on it, so a
// typo cannot quietly create a second event that splits a funnel in two, and
// the endpoint cannot be used to write arbitrary rows.

export const EVENT_NAMES = [
  'app_open',          // once per device per day
  'tour_started',      // { replay }
  'tour_step',         // { step, sport? }  — reached this step
  'tour_skipped',      // { made }          — left the pick step early
  'tour_finished',
  'invite_shared',     // tapped "invite a friend"
  'invite_accepted',   // opened an invite link and signed in
  'card_shared',       // { kind }          — shared a rank or pool image
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export function isEventName(x: unknown): x is EventName {
  return typeof x === 'string' && (EVENT_NAMES as readonly string[]).includes(x);
}

/**
 * Record an event. Fire-and-forget: analytics must never slow the app down,
 * surface an error, or break a screen, so every failure is swallowed.
 */
export function track(name: EventName, props?: Record<string, string | number | boolean | null>): void {
  if (typeof window === 'undefined') return;
  try {
    fetch('/api/events', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, props }),
      // The page is sometimes navigating away as this fires.
      keepalive: true,
    }).catch(() => { /* never the user's problem */ });
  } catch { /* same */ }
}

// A short, shared "don't pull-to-refresh right now" latch.
//
// Pull-to-refresh listens on `document`, so a swipe that starts inside a
// bottom sheet arms BOTH gestures from the same touch. Dismissing a sheet with
// a downward flick therefore kept feeding that same finger movement into the
// pull, and overshooting the sheet's 72px threshold reloaded the page
// underneath it.
//
// Two defences, and this is the second. The first is that pull-to-refresh
// ignores touches originating inside an overlay at all. This latch covers the
// tail: the finger is usually still travelling when the sheet unmounts, and a
// stray touchstart landing on the page behind it in that instant should not
// start a refresh either.

let lockedUntil = 0;

/** Block pull-to-refresh for `ms` from now. */
export function lockPullToRefresh(ms = 600): void {
  lockedUntil = Math.max(lockedUntil, Date.now() + ms);
}

export function isPullToRefreshLocked(): boolean {
  return Date.now() < lockedUntil;
}

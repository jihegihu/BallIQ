// When a game stops accepting picks.
//
// One definition, imported by the board, the game page and the API. It used to
// exist three times — twice hardcoded at 15 minutes in components, once as a
// constant on the server — so the client could believe a game was open while
// the server rejected the pick.
//
// One minute is deliberately tight: there is no edge in picking a game that is
// already under way, and anything longer just removes games people still want.
// Being this close to kick-off does mean client and server clocks can disagree
// by a few seconds, so the server stays the authority — the UI locking is a
// courtesy, and /api/picks enforces it.
export const LOCK_WINDOW_MS = 60 * 1000;

export function isLocked(commenceTime: string): boolean {
  return new Date(commenceTime).getTime() - Date.now() < LOCK_WINDOW_MS;
}

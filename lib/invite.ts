// Invite links and sharing out of the app.
//
// An invite link is https://balliq.dev/invite/<the inviter's user id>. The id,
// not the username: usernames re-sync from Clerk and can contain spaces, so a
// link built on one would break the day the name changed.

export const SITE_URL = 'https://balliq.dev';
export const APP_STORE_URL = 'https://apps.apple.com/app/id6785253664';

/** Where an opened invite is remembered until the visitor signs in. */
export const INVITE_STORAGE_KEY = 'balliq-invite';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function inviteUrl(userId: string): string {
  return `${SITE_URL}/invite/${userId}`;
}

export const INVITE_TEXT = 'Join me on BallIQ. Pick games, build a rating, no money involved.';

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Hand something to the system share sheet, falling back to copying the link.
 *
 * `file` must already be in hand. iOS only allows a share that starts directly
 * from a tap, and waiting on a download first loses that permission — so the
 * caller fetches the image ahead of time and passes it in, or passes nothing
 * and the link goes out as text.
 */
export async function shareOut(opts: { text: string; url: string; file?: File | null }): Promise<ShareOutcome> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  const line = `${opts.text} ${opts.url}`;

  if (typeof nav.share === 'function') {
    const withFile = !!opts.file && typeof nav.canShare === 'function' && nav.canShare({ files: [opts.file] });
    try {
      await nav.share(withFile ? { files: [opts.file as File], text: line } : { text: opts.text, url: opts.url });
      return 'shared';
    } catch (err) {
      // Closing the sheet is a choice, not a failure; do not then also copy.
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }

  try {
    await navigator.clipboard.writeText(line);
    return 'copied';
  } catch {
    return 'failed';
  }
}

'use client';

// Two halves of one handoff. InviteRemember runs on the public invite page and
// notes who sent the link; InviteAcceptor runs inside the app once the visitor
// has an account, and turns that note into a friendship.
//
// The note is kept until it has been acted on, not just until the next page,
// because signing up takes several screens and may not happen the same day.

import { useEffect } from 'react';
import { useUserStore } from '@/lib/userStore';
import { INVITE_STORAGE_KEY, UUID_RE } from '@/lib/invite';
import { track } from '@/lib/events';

export default function InviteRemember({ inviterId }: { inviterId: string }) {
  useEffect(() => {
    try { localStorage.setItem(INVITE_STORAGE_KEY, inviterId); } catch { /* private mode */ }
  }, [inviterId]);
  return null;
}

export function InviteAcceptor() {
  const hydrated = useUserStore((s) => s.hydrated);
  const userId   = useUserStore((s) => s.user.id);
  const refresh  = useUserStore((s) => s.refresh);

  useEffect(() => {
    if (!hydrated || !userId) return;
    let inviterId: string | null = null;
    try { inviterId = localStorage.getItem(INVITE_STORAGE_KEY); } catch { return; }
    if (!inviterId) return;

    const forget = () => { try { localStorage.removeItem(INVITE_STORAGE_KEY); } catch { /* nothing to do */ } };

    // Your own link, or junk: nothing to accept.
    if (inviterId === userId || !UUID_RE.test(inviterId)) { forget(); return; }

    fetch('/api/invite', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ inviterId }),
    })
      .then((r) => {
        // Kept on a server error so the next launch can try again; dropped on
        // anything the server has definitely answered.
        if (r.status >= 500) return;
        forget();
        if (r.ok) { track('invite_accepted'); void refresh(); }
      })
      .catch(() => { /* offline: try again next launch */ });
  }, [hydrated, userId, refresh]);

  return null;
}

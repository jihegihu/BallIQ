'use client';

// The two ways out of the app: an invite link, and a picture of a result.
//
// Both go through the system share sheet where there is one and fall back to
// copying the link where there is not, then say which happened — a button
// that silently copies to the clipboard looks like a button that did nothing.

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { useUserStore } from '@/lib/userStore';
import { inviteUrl, shareOut, INVITE_TEXT, type ShareOutcome } from '@/lib/invite';
import { track } from '@/lib/events';
import { hapticImpact } from '@/lib/haptics';

function useNotice(): [string, (o: ShareOutcome) => void] {
  const [notice, setNotice] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const report = (outcome: ShareOutcome) => {
    const text =
      outcome === 'copied' ? 'Link copied' :
      outcome === 'failed' ? 'Could not share from this device' : '';
    setNotice(text);
    if (timer.current) clearTimeout(timer.current);
    if (text) timer.current = setTimeout(() => setNotice(''), 2500);
  };
  return [notice, report];
}

/** "Invite a friend": shares this account's invite link. */
export function InviteButton({ className = '' }: { className?: string }) {
  const userId = useUserStore((s) => s.user.id);
  const [notice, report] = useNotice();

  if (!userId) return null;

  return (
    <button
      onClick={async () => {
        hapticImpact('light');
        track('invite_shared');
        report(await shareOut({ text: INVITE_TEXT, url: inviteUrl(userId) }));
      }}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-rim bg-card px-4 py-2.5 text-sm font-black text-ink active:scale-[0.98] transition-transform ${className}`}
    >
      <Icon name="users" size={15} className="text-accent" />
      {notice || 'Invite a friend'}
    </button>
  );
}

/**
 * Shares a result card (see /api/share/card) along with the invite link.
 *
 * The image is fetched as soon as the button appears, not when it is tapped.
 * iOS only lets a share begin directly from a tap, and waiting on a download
 * in between loses that — so by the time of the tap the file is already here.
 * If it is not (slow connection), the link goes out on its own.
 */
export function ShareCardButton({ card, kind, text, label = 'Share', className = '' }: {
  /** Path and query of the card, e.g. "/api/share/card?kind=rank". */
  card: string;
  kind: 'rank' | 'pool';
  text: string;
  label?: string;
  className?: string;
}) {
  const userId = useUserStore((s) => s.user.id);
  const file = useRef<File | null>(null);
  const [notice, report] = useNotice();

  useEffect(() => {
    let alive = true;
    file.current = null;
    fetch(card)
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (alive && blob) file.current = new File([blob], 'balliq.png', { type: 'image/png' });
      })
      .catch(() => { /* share the link alone */ });
    return () => { alive = false; };
  }, [card]);

  if (!userId) return null;

  return (
    <button
      onClick={async () => {
        hapticImpact('light');
        track('card_shared', { kind });
        report(await shareOut({ text, url: inviteUrl(userId), file: file.current }));
      }}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-rim bg-card px-4 py-2.5 text-sm font-black text-ink active:scale-[0.98] transition-transform ${className}`}
    >
      <Icon name="arrowRight" size={15} className="text-accent" />
      {notice || label}
    </button>
  );
}

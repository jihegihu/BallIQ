'use client';

// Keeps the Zustand store in sync with Supabase.
//
// Initial load fetches picks + stats once. After that it REFETCHES whenever the
// app comes back to the foreground, because picks settle server-side on a cron:
// without this the rating (and every sport rating behind the Elo button) stayed
// frozen at whatever it was when the page first loaded. In the native shell
// that's especially bad — the webview survives backgrounding for days, so the
// numbers could be stale indefinitely with no way to refresh short of a reload.

import { useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { useUserStore, rehydrateFromServer } from '@/lib/userStore';

// Don't hammer the API if the user flicks between apps.
const MIN_REFRESH_GAP_MS = 20_000;

export default function DBHydrator() {
  const { isLoaded, isSignedIn } = useUser();
  const hydrated = useUserStore((s) => s.hydrated);
  const hydrate  = useUserStore((s) => s.hydrate);
  const lastFetch = useRef(0);

  // First load.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || hydrated) return;
    lastFetch.current = Date.now();
    fetch('/api/picks', { cache: 'no-store' })
      .then((r) => r.json())
      .then(({ picks, user }) => hydrate(picks ?? [], user ?? {}))
      .catch((e) => console.warn('[DBHydrator]', e));
  }, [isLoaded, isSignedIn, hydrated, hydrate]);

  // Refresh on foreground / reconnect.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    const maybeRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastFetch.current < MIN_REFRESH_GAP_MS) return;
      lastFetch.current = Date.now();
      rehydrateFromServer();
    };

    document.addEventListener('visibilitychange', maybeRefresh);
    window.addEventListener('focus', maybeRefresh);
    window.addEventListener('online', maybeRefresh);
    return () => {
      document.removeEventListener('visibilitychange', maybeRefresh);
      window.removeEventListener('focus', maybeRefresh);
      window.removeEventListener('online', maybeRefresh);
    };
  }, [isLoaded, isSignedIn]);

  return null;
}

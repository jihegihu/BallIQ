'use client';

// Runs once after the user is authenticated. Fetches picks + stats from Supabase
// and hydrates the Zustand store. Silently skips if the DB is unreachable.

import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useUserStore } from '@/lib/userStore';

export default function DBHydrator() {
  const { isLoaded, isSignedIn } = useUser();
  const hydrated = useUserStore((s) => s.hydrated);
  const hydrate  = useUserStore((s) => s.hydrate);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || hydrated) return;
    fetch('/api/picks')
      .then((r) => r.json())
      .then(({ picks, user }) => {
        hydrate(picks ?? [], user ?? {});
      })
      .catch((e) => console.warn('[DBHydrator]', e));
  }, [isLoaded, isSignedIn, hydrated, hydrate]);

  return null;
}

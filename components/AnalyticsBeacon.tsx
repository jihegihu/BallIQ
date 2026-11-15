'use client';

// Records that this account opened the app today. Renders nothing.
//
// Once per device per day, not once per launch: the question it answers is
// "did they come back", and a count of launches would only make the table
// bigger without changing that answer.

import { useEffect } from 'react';
import { useUserStore } from '@/lib/userStore';
import { track } from '@/lib/events';
import { etDay } from '@/lib/xp';

const KEY = 'balliq-open-day';

export default function AnalyticsBeacon() {
  const hydrated = useUserStore((s) => s.hydrated);
  const userId   = useUserStore((s) => s.user.id);

  useEffect(() => {
    if (!hydrated || !userId) return;
    const stamp = `${userId}|${etDay()}`;
    try {
      if (localStorage.getItem(KEY) === stamp) return;
      localStorage.setItem(KEY, stamp);
    } catch { /* private mode: record it anyway */ }
    track('app_open');
  }, [hydrated, userId]);

  return null;
}

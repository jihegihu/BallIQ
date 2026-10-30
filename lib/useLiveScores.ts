'use client';

// Polls /api/live-scores while there are games in progress.
//
// Free to call — the endpoint reads ESPN, not The Odds API — so the interval
// is set by what feels live rather than by a credit budget. It stops entirely
// when nothing is in progress and while the tab is hidden, so an app left open
// in the background isn't quietly requesting all night.

import { useEffect, useRef, useState } from 'react';

export type LiveScore = {
  id: string;
  homeScore: number | null;
  awayScore: number | null;
  completed: boolean;
};

const POLL_MS = 45_000;

export function useLiveScores(enabled: boolean): Map<string, LiveScore> {
  const [scores, setScores] = useState<Map<string, LiveScore>>(new Map());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // No synchronous setState here — clearing on disable would cascade a
    // render for no benefit. When nothing is in progress the consumer isn't
    // reading these anyway, and the next enable refetches immediately.
    if (!enabled) return;

    let cancelled = false;

    const load = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/live-scores', { cache: 'no-store' });
        if (!res.ok) return;
        const { games } = await res.json() as { games: LiveScore[] };
        if (!cancelled) setScores(new Map((games ?? []).map((g) => [g.id, g])));
      } catch {
        /* a failed poll just leaves the last scores on screen */
      }
    };

    load();
    timer.current = setInterval(load, POLL_MS);
    document.addEventListener('visibilitychange', load);

    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener('visibilitychange', load);
    };
  }, [enabled]);

  return scores;
}

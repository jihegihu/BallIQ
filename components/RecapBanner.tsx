'use client';

// "Since you were last here" — shows Elo movement from picks that settled
// while the user was away. The last-seen timestamp lives in localStorage and
// advances as soon as a recap is computed, so the same recap never repeats.

import { useEffect, useState } from 'react';
import { useUserStore } from '@/lib/userStore';

const LAST_SEEN_KEY = 'balliq-last-recap';

type Recap = { net: number; wins: number; losses: number; pushes: number };

export default function RecapBanner() {
  const hydrated = useUserStore((s) => s.hydrated);
  const picks    = useUserStore((s) => s.user.picks);
  const [recap, setRecap]         = useState<Recap | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!hydrated || recap) return;

    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    if (!lastSeen) {
      // First visit — establish the baseline, nothing to recap yet
      localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
      return;
    }

    const since   = new Date(lastSeen).getTime();
    const settled = picks.filter(
      (p) =>
        (p.outcome === 'win' || p.outcome === 'loss' || p.outcome === 'push') &&
        p.resolvedAt &&
        new Date(p.resolvedAt).getTime() > since,
    );
    if (settled.length === 0) return;

    // Advance the baseline immediately so a reload doesn't replay this recap
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());

    setRecap({
      net:    settled.reduce((s, p) => s + (p.eloDelta ?? 0), 0),
      wins:   settled.filter((p) => p.outcome === 'win').length,
      losses: settled.filter((p) => p.outcome === 'loss').length,
      pushes: settled.filter((p) => p.outcome === 'push').length,
    });
  }, [hydrated, picks, recap]);

  if (!recap || dismissed) return null;

  const up  = recap.net >= 0;
  const cls = up ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className={`mb-4 rounded-xl border px-3.5 py-2.5 flex items-center gap-3 ${
      up ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-red-500/10 border-red-500/25'
    }`}>
      <span className={`text-lg font-black ${cls}`}>{up ? '▲' : '▼'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-dim uppercase tracking-widest font-bold">While you were away</p>
        <p className="text-sm font-black text-ink">
          <span className={cls}>{up ? '+' : ''}{recap.net} Elo</span>
          <span className="text-dim font-bold text-xs ml-2">
            {recap.wins}W–{recap.losses}L{recap.pushes > 0 ? `–${recap.pushes}P` : ''}
          </span>
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss recap"
        className="text-dim hover:text-ink text-sm font-bold px-2 py-1 -mr-1"
      >
        ✕
      </button>
    </div>
  );
}

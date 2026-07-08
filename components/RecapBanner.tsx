'use client';

// Post-settle celebration — a modal that pops when picks settled while the
// user was away (or since their last visit to the board). The last-seen
// timestamp lives in localStorage and advances as soon as a recap is
// computed, so the same celebration never repeats.

import { useEffect, useState } from 'react';
import { useUserStore } from '@/lib/userStore';
import { UserPick } from '@/types';

const LAST_SEEN_KEY = 'balliq-last-recap';

type Recap = {
  net: number;
  wins: number;
  losses: number;
  pushes: number;
  bestWin: UserPick | null;   // biggest positive eloDelta in the batch
  boldCall: boolean;          // best win was an above-your-level (underdog) pick
};

export default function RecapBanner() {
  const hydrated  = useUserStore((s) => s.hydrated);
  const picks     = useUserStore((s) => s.user.picks);
  const globalElo = useUserStore((s) => s.user.globalElo);
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

    const wins    = settled.filter((p) => p.outcome === 'win');
    const bestWin = wins.reduce<UserPick | null>(
      (best, p) => ((p.eloDelta ?? 0) > (best?.eloDelta ?? 0) ? p : best),
      null,
    );

    setRecap({
      net:    settled.reduce((s, p) => s + (p.eloDelta ?? 0), 0),
      wins:   wins.length,
      losses: settled.filter((p) => p.outcome === 'loss').length,
      pushes: settled.filter((p) => p.outcome === 'push').length,
      bestWin,
      // "Bold" = the event was rated above the user at pick time (an underdog
      // by their standards), which is what earns outsized Elo.
      boldCall: !!bestWin && bestWin.eventElo > bestWin.userEloAtPick,
    });
  }, [hydrated, picks, recap]);

  if (!recap || dismissed) return null;

  const up  = recap.net >= 0;
  const cls = up ? 'text-emerald-400' : 'text-red-400';

  const headline =
    recap.losses === 0 && recap.wins > 0 ? (recap.wins === 1 ? 'Called it!' : 'Clean sweep!') :
    up  ? 'Rating up!' :
    recap.wins > 0 ? 'Mixed bag' : 'Tough slate';

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => setDismissed(true)}
      />

      {/* Card */}
      <div className="relative w-full max-w-sm bg-card border border-rim rounded-2xl p-6 pb-5 shadow-2xl text-center">
        <p className="text-[10px] text-dim uppercase tracking-widest font-bold mb-2">
          Your picks settled
        </p>

        <p className="text-4xl mb-1">{up ? (recap.losses === 0 ? '🎯' : '📈') : '📉'}</p>
        <h2 className="text-xl font-black text-ink">{headline}</h2>

        {/* Net Elo hero */}
        <p className={`text-5xl font-black tabular-nums leading-none mt-3 ${cls}`}>
          {up ? '▲ +' : '▼ '}{Math.abs(recap.net)}
          <span className="text-base font-bold ml-1">Elo</span>
        </p>

        <p className="text-sm font-bold text-sub mt-2">
          <span className="text-emerald-400">{recap.wins}W</span>
          <span className="text-dim mx-1">–</span>
          <span className="text-red-400">{recap.losses}L</span>
          {recap.pushes > 0 && <><span className="text-dim mx-1">–</span><span className="text-sub">{recap.pushes}P</span></>}
          <span className="text-dim ml-2">· now at {globalElo.toLocaleString()}</span>
        </p>

        {/* Best-pick callout */}
        {recap.bestWin && (recap.bestWin.eloDelta ?? 0) > 0 && (
          <div className="mt-4 bg-layer rounded-xl px-3.5 py-2.5 text-left flex items-center gap-3">
            <span className="text-lg">{recap.boldCall ? '🔮' : '✅'}</span>
            <div className="min-w-0">
              <p className="text-[10px] text-dim uppercase tracking-widest font-bold">
                {recap.boldCall ? 'You called the upset' : 'Best pick'}
              </p>
              <p className="text-xs font-black text-ink truncate">
                {recap.bestWin.matchDescription}
                <span className="text-emerald-400 ml-1.5">+{recap.bestWin.eloDelta}</span>
              </p>
            </div>
          </div>
        )}

        <button
          onClick={() => setDismissed(true)}
          className="w-full mt-5 py-2.5 rounded-xl text-sm font-black text-white transition active:scale-95"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #A78BFA)' }}
        >
          {up ? 'Keep climbing →' : 'Win it back →'}
        </button>
      </div>
    </div>
  );
}

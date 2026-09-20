'use client';

// Fixed top banner: BallIQ wordmark on the left (moved here off the games
// screen, which frees that space for the board itself), live rating pill on
// the right. Tapping the pill opens the rating sheet.

import { useState } from 'react';
import Link from 'next/link';
import { useUserStore } from '@/lib/userStore';
import { hapticImpact } from '@/lib/haptics';
import EloSheet from '@/components/EloSheet';

export default function EloHeader() {
  const [open, setOpen] = useState(false);
  const user       = useUserStore((s) => s.user);
  const syncFailed = useUserStore((s) => s.syncFailed);

  return (
    <>
      {/* paddingTop extends the bar's background up under the iPhone notch */}
      <div
        className="fixed top-0 left-0 right-0 z-40 bg-base/95 backdrop-blur-sm border-b border-rim"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-md mx-auto px-4 h-12 flex items-center justify-between">
          <Link
            href="/"
            onClick={() => hapticImpact('light')}
            className="text-xl font-black tracking-tight text-ink leading-none active:scale-95 transition"
          >
            Ball<span className="text-accent">IQ</span>
          </Link>

          <button
            onClick={() => { hapticImpact('light'); setOpen(true); }}
            className="flex items-center gap-1.5 bg-card border border-rim rounded-full px-3 py-1.5 hover:border-accent/40 transition-all active:scale-95"
          >
            <span className="text-accent text-[9px]">◆</span>
            <span className="text-ink font-black text-sm tabular-nums">
              {user.globalElo.toLocaleString()}
            </span>
            <span className="text-dim text-[10px]">ELO</span>
            {user.currentStreak > 0 && (
              <span className="text-[10px] font-bold text-orange-400 ml-0.5">
                {user.currentStreak}🔥
              </span>
            )}
          </button>
        </div>

        {/* A pick that never reached the server would otherwise fail silently. */}
        {syncFailed && (
          <button
            onClick={() => useUserStore.getState().refresh()}
            className="w-full bg-amber-500/15 border-t border-amber-500/30 py-1 text-[10px] font-bold text-amber-400"
          >
            Couldn&rsquo;t reach the server — tap to retry
          </button>
        )}
      </div>

      {open && <EloSheet onClose={() => setOpen(false)} />}
    </>
  );
}

'use client';

// Sticky summary of tonight's action — sits just above the bottom nav on the
// games page and links to the Picks tab.

import Link from 'next/link';
import { useUserStore } from '@/lib/userStore';

export default function PendingPicksBar() {
  const picks   = useUserStore((s) => s.user.picks);
  const pending = picks.filter((p) => p.outcome === 'pending');

  if (pending.length === 0) return null;

  const potential = pending.reduce((s, p) => s + p.projectedGain, 0);

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-2 pointer-events-none">
      <Link
        href="/picks"
        className="pointer-events-auto flex items-center justify-between max-w-md mx-auto bg-layer/95 backdrop-blur-sm border border-accent/30 rounded-xl px-4 py-2.5 shadow-lg active:scale-[0.98] transition-all"
      >
        <span className="text-xs font-black text-ink">
          {pending.length} pick{pending.length !== 1 ? 's' : ''} riding
        </span>
        <span className="text-xs font-bold text-dim">
          potential <span className="text-emerald-400 font-black">+{potential} Elo</span>
          <span className="text-accent ml-2">›</span>
        </span>
      </Link>
    </div>
  );
}

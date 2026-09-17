'use client';

// Bottom sheet revealed by long-pressing a game card: the full bet surface
// (moneyline / spread / over-under) without leaving the games list. Native-app
// pattern — backdrop dims the list, sheet slides up from the bottom edge.

import { useEffect } from 'react';
import { Match } from '@/types';
import MatchHeader from '@/components/MatchHeader';
import BetPanel from '@/components/BetPanel';

export default function BetSheet({ match, onClose }: { match: Match; onClose: () => void }) {
  // Lock page scroll behind the sheet.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Backdrop */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-[fadeIn_.2s_ease-out]"
      />

      {/* Sheet */}
      <div className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-card border-t border-x border-rim rounded-t-3xl max-h-[88dvh] flex flex-col animate-[sheetUp_.28s_cubic-bezier(0.32,0.72,0,1)]">
        {/* Grab handle */}
        <div className="pt-2.5 pb-1 flex justify-center shrink-0" onClick={onClose}>
          <div className="w-9 h-1 rounded-full bg-rim" />
        </div>

        <div
          className="overflow-y-auto overscroll-contain px-4 pt-2"
          style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
        >
          <MatchHeader match={match} compact />
          <div className="mt-4">
            <BetPanel match={match} />
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

// Bottom sheet revealed by long-pressing a game card: the full bet surface
// (moneyline / spread / over-under) without leaving the games list. Native-app
// pattern — backdrop dims the list, sheet slides up, swipe it back down to
// dismiss.

import { useEffect } from 'react';
import { Match } from '@/types';
import MatchHeader from '@/components/MatchHeader';
import BetPanel from '@/components/BetPanel';
import { useDragDismiss } from '@/lib/useDragDismiss';

export default function BetSheet({ match, onClose }: { match: Match; onClose: () => void }) {
  const { scrollRef, dragHandlers, sheetStyle } = useDragDismiss(onClose);

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
      <div
        style={sheetStyle}
        className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-card border-t border-x border-rim rounded-t-3xl max-h-[88dvh] flex flex-col animate-[sheetUp_.28s_cubic-bezier(0.32,0.72,0,1)]"
      >
        {/* Grab handle. The hit area is deliberately much taller than the bar
            it draws — the bar is a 4px visual cue, but a finger needs
            somewhere around 36px to land on reliably. */}
        <div
          {...dragHandlers}
          className="pt-3 pb-2.5 flex justify-center shrink-0 cursor-grab active:cursor-grabbing touch-none"
        >
          <div className="w-10 h-1 rounded-full bg-rim" />
        </div>

        {/* The body is draggable too, which is what actually makes this feel
            like an iOS sheet: anywhere in the sheet pulls it down, as long as
            the content is already scrolled to the top (the hook checks).
            No touch-none here — the browser keeps ownership of scrolling and
            cancels the drag the moment a real scroll starts. */}
        <div
          {...dragHandlers}
          ref={scrollRef as React.Ref<HTMLDivElement>}
          className="overflow-y-auto overscroll-contain px-4 pt-2"
          style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
        >
          <MatchHeader match={match} compact dragHandlers={dragHandlers} />
          <div className="mt-4">
            <BetPanel match={match} />
          </div>
        </div>
      </div>
    </div>
  );
}

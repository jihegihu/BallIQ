'use client';

// Swipe-down-to-dismiss for bottom sheets. The sheet tracks your finger, then
// either snaps back or closes depending on how far / how fast you flung it —
// the iOS sheet behaviour users already expect.
//
// Downward drags are only captured when the sheet's scrollable body is already
// at the top, so scrolling content inside the sheet still works normally.

import { useCallback, useRef, useState } from 'react';
import { hapticImpact } from '@/lib/haptics';

// Tuned down from 110px / 0.5. The sheet was genuinely hard to dismiss: you
// had to find a 15px handle AND drag a third of the screen. 72px is still
// well clear of an accidental brush, and a gentler flick threshold means a
// quick downward swipe works without having to be fast about it.
const CLOSE_DISTANCE_PX = 72;
const CLOSE_VELOCITY    = 0.3;

export function useDragDismiss(onClose: () => void) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  const startY   = useRef(0);
  const startT   = useRef(0);
  const active   = useRef(false);
  const scroller = useRef<HTMLElement | null>(null);

  /** Attach to the sheet's scrollable body. */
  const scrollRef = useCallback((el: HTMLElement | null) => { scroller.current = el; }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // Only start a drag when content is scrolled to the very top, otherwise
    // the user means to scroll.
    if ((scroller.current?.scrollTop ?? 0) > 0) return;
    active.current = true;
    startY.current = e.clientY;
    startT.current = performance.now();
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!active.current) return;
    const dy = e.clientY - startY.current;
    if (dy < 0) { setDragY(0); return; }    // never drag above its resting place
    // 1:1 with the finger. The old 0.9 damping meant the sheet always lagged
    // slightly behind the touch, which reads as unresponsive at small drags.
    setDragY(dy);
  }, []);

  const end = useCallback((e: React.PointerEvent) => {
    if (!active.current) return;
    active.current = false;
    setDragging(false);

    const dy = Math.max(0, e.clientY - startY.current);
    const velocity = dy / Math.max(1, performance.now() - startT.current);

    if (dy > CLOSE_DISTANCE_PX || velocity > CLOSE_VELOCITY) {
      hapticImpact('light');
      setDragY(0);
      onClose();
    } else {
      setDragY(0);   // snap back
    }
  }, [onClose]);

  return {
    scrollRef,
    dragY,
    /** Spread onto the sheet's drag surface (handle + header region). */
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
    },
    /** Spread onto the sheet element itself. */
    sheetStyle: {
      transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
      transition: dragging ? 'none' : 'transform .25s cubic-bezier(0.32,0.72,0,1)',
    } as React.CSSProperties,
  };
}

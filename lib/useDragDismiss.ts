'use client';

// Swipe-down-to-dismiss for bottom sheets. The sheet tracks your finger, then
// either snaps back or closes depending on how far / how fast you flung it —
// the iOS sheet behaviour users already expect.
//
// Downward drags are only captured when the sheet's scrollable body is already
// at the top, so scrolling content inside the sheet still works normally.

import { useCallback, useRef, useState } from 'react';
import { hapticImpact } from '@/lib/haptics';

const CLOSE_DISTANCE_PX = 110;   // far enough down → close
const CLOSE_VELOCITY    = 0.5;   // px/ms flick → close regardless of distance

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
    // Slight resistance so it feels attached rather than loose.
    setDragY(dy < 0 ? 0 : dy * 0.9);
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

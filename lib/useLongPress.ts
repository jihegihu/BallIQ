'use client';

// Long-press detection via pointer events. Fires `onLongPress` after `ms` of
// sustained contact without significant movement, and suppresses the click
// that would otherwise fire on release (so a long-press doesn't also trigger
// the element's tap action). Spread the returned handlers onto the target.

import { useRef, useCallback } from 'react';

const MOVE_TOLERANCE_PX = 12;

export function useLongPress(onLongPress: () => void, ms = 400) {
  const timer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin   = useRef<{ x: number; y: number } | null>(null);
  const fired    = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    origin.current = null;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Primary button / first touch only.
    if (e.button !== 0) return;
    fired.current  = false;
    origin.current = { x: e.clientX, y: e.clientY };
    timer.current  = setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, ms);
  }, [onLongPress, ms]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!origin.current) return;
    const dx = e.clientX - origin.current.x;
    const dy = e.clientY - origin.current.y;
    if (dx * dx + dy * dy > MOVE_TOLERANCE_PX * MOVE_TOLERANCE_PX) clear();  // it's a scroll, not a press
  }, [clear]);

  // Capture-phase click suppression after a fired long-press.
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (fired.current) {
      e.preventDefault();
      e.stopPropagation();
      fired.current = false;
    }
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp:     clear,
    onPointerCancel: clear,
    onPointerLeave:  clear,
    onClickCapture,
    // Long-press on iOS also triggers the system context menu / text callout —
    // suppress so our sheet is the only response.
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

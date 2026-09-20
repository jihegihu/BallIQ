'use client';

// Press-and-hold to commit a pick. A colour wash sweeps across the button as
// you hold; let go early and it drains away with nothing placed.
//
// Why hold instead of tap: picks move your rating, and the board is also
// long-pressable (a card opens the full bet sheet). A deliberate hold makes
// commitment explicit and makes stray taps harmless.
//
// Removing an existing pick is a plain tap — undoing shouldn't cost 3 seconds.

import { useCallback, useEffect, useRef, useState } from 'react';
import { hapticImpact, hapticSuccess } from '@/lib/haptics';

/** How long the user must hold to place a pick. */
export const HOLD_MS = 3000;

const MOVE_TOLERANCE_PX = 14;
// Escalating ticks so the hold has a rhythm rather than dead air.
const TICKS = [0.34, 0.67];

type Props = {
  onCommit: () => void;
  onRemove: () => void;
  selected: boolean;
  disabled?: boolean;
  className?: string;
  /** Applied while the hold is in progress or the pick is selected. */
  selectedClassName?: string;
  children: React.ReactNode;
};

export default function HoldToPick({
  onCommit,
  onRemove,
  selected,
  disabled = false,
  className = '',
  selectedClassName = '',
  children,
}: Props) {
  const [progress, setProgress] = useState(0);   // 0 → 1
  const [justCommitted, setJustCommitted] = useState(false);

  const rafId     = useRef<number | null>(null);
  const startedAt = useRef(0);
  const origin    = useRef<{ x: number; y: number } | null>(null);
  const nextTick  = useRef(0);
  const holding   = useRef(false);

  const stop = useCallback(() => {
    holding.current = false;
    origin.current  = null;
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    setProgress(0);
  }, []);

  // Never leave a rAF running past unmount.
  useEffect(() => () => {
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled || e.button !== 0) return;
    // Keep the parent card's long-press (which opens the bet sheet) from
    // firing while the user is deliberately holding a bet button.
    e.stopPropagation();

    if (selected) return;   // removal happens on pointer-up

    // Function *declaration* so the animation loop can schedule itself
    // without a self-referencing const.
    function step() {
      if (!holding.current) return;

      const p = Math.min(1, (performance.now() - startedAt.current) / HOLD_MS);
      setProgress(p);

      if (nextTick.current < TICKS.length && p >= TICKS[nextTick.current]) {
        nextTick.current += 1;
        hapticImpact('light');
      }

      if (p >= 1) {
        holding.current = false;
        rafId.current   = null;
        setProgress(0);
        setJustCommitted(true);
        hapticSuccess();
        onCommit();
        return;
      }
      rafId.current = requestAnimationFrame(step);
    }

    holding.current   = true;
    origin.current    = { x: e.clientX, y: e.clientY };
    startedAt.current = performance.now();
    nextTick.current  = 0;
    hapticImpact('light');
    rafId.current = requestAnimationFrame(step);
  }, [disabled, selected, onCommit]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!origin.current) return;
    const dx = e.clientX - origin.current.x;
    const dy = e.clientY - origin.current.y;
    // Treat it as a scroll, not a hold.
    if (dx * dx + dy * dy > MOVE_TOLERANCE_PX ** 2) stop();
  }, [stop]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    e.stopPropagation();
    if (selected) {
      hapticImpact('light');
      onRemove();
      return;
    }
    stop();
  }, [disabled, selected, onRemove, stop]);

  const active = progress > 0;

  return (
    <button
      type="button"
      data-bet-button
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
      onAnimationEnd={() => setJustCommitted(false)}
      aria-pressed={selected}
      className={`relative overflow-hidden touch-none ${className} ${selected ? selectedClassName : ''}`}
      style={justCommitted ? { animation: 'pickPop .28s ease-out' } : undefined}
    >
      {/* Fill sweep — sits behind the content, never intercepts pointers. */}
      {active && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 pointer-events-none"
          style={{
            width: `${progress * 100}%`,
            background: 'color-mix(in srgb, var(--c-pick) 26%, transparent)',
            borderRight: '2px solid var(--c-pick)',
          }}
        />
      )}
      <span className="relative flex flex-col items-center w-full">{children}</span>
    </button>
  );
}

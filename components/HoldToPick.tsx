'use client';

// Press-and-hold to commit a pick. A colour wash sweeps across the button as
// you hold; let go early and it drains away with nothing placed.
//
// Why hold instead of tap: picks move your rating, and the board is also
// long-pressable (a card opens the full bet sheet). A deliberate hold makes
// commitment explicit and makes stray taps harmless.
//
// Removing an existing pick is a plain tap — undoing shouldn't cost a hold.

import { useCallback, useEffect, useRef, useState } from 'react';
import { hapticImpact, hapticSuccess } from '@/lib/haptics';

/**
 * How long the user must hold to place a pick.
 *
 * 1s is about the ceiling for a press-and-hold confirm: iOS's own long-press
 * fires at 500ms, and platform "hold to confirm" affordances land in the
 * 800ms–1.2s band. Longer than that and every pick feels like a chore.
 */
export const HOLD_MS = 1000;

/**
 * Finger travel that abandons a hold.
 *
 * Generous on purpose. `touch-action: pan-y` means the browser owns vertical
 * scrolling and fires `pointercancel` the instant it starts scrolling — that,
 * not this threshold, is what distinguishes a scroll from a press. A tight
 * threshold here only punished the natural drift of a finger resting for a
 * full second, which read as "it didn't register".
 */
const MOVE_TOLERANCE_PX = 26;

// One mid-hold tick, so the press has a rhythm without feeling like a buzzer.
const TICKS = [0.5];

// How long the filled bar lingers after commit before handing the visual over
// to the button's selected styling. Long enough to read as "it took".
const CONFIRM_HOLD_MS = 300;

type Props = {
  onCommit: () => void;
  onRemove: () => void;
  selected: boolean;
  disabled?: boolean;
  className?: string;
  /** Applied while the pick is selected. */
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
  const [flash, setFlash] = useState(false);     // brief post-commit confirm

  const rafId       = useRef<number | null>(null);
  const confirmTmr  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt   = useRef(0);
  const origin      = useRef<{ x: number; y: number } | null>(null);
  const nextTick    = useRef(0);
  const holding     = useRef(false);
  /**
   * True from the moment a hold commits until the finger lifts.
   *
   * Without this the gesture ate its own pick: the hold completes while the
   * finger is still down, `selected` flips to true, and the pointer-up that
   * follows is then read as the "tap to undo" gesture — placing and instantly
   * deleting the pick. That's the intermittent "didn't register" behaviour.
   */
  const committed = useRef(false);

  const cancelHold = useCallback(() => {
    holding.current = false;
    origin.current  = null;
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }, []);

  /** Abandon an in-flight hold and drain the fill. Never touches a commit. */
  const abort = useCallback(() => {
    if (committed.current) return;   // the fill is showing a confirmation
    cancelHold();
    setProgress(0);
  }, [cancelHold]);

  useEffect(() => () => {
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    if (confirmTmr.current) clearTimeout(confirmTmr.current);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled || e.button !== 0) return;
    // Keep the parent card's long-press (which opens the bet sheet) from
    // firing while the user is deliberately holding a bet button.
    e.stopPropagation();

    committed.current = false;
    if (selected) return;   // removal happens on pointer-up

    // Keep receiving events even if the finger drifts off the button, so a
    // small wander can't silently kill the hold.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }

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
        holding.current   = false;
        rafId.current     = null;
        committed.current = true;

        // Hold the bar full rather than snapping to empty — resetting here is
        // what made the confirmation look delayed or absent.
        setProgress(1);
        setFlash(true);
        hapticSuccess();
        onCommit();

        confirmTmr.current = setTimeout(() => {
          setProgress(0);
          setFlash(false);
        }, CONFIRM_HOLD_MS);
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
    if (dx * dx + dy * dy > MOVE_TOLERANCE_PX ** 2) abort();
  }, [abort]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    e.stopPropagation();

    // This press just placed the pick — lifting must not undo it.
    if (committed.current) {
      committed.current = false;
      cancelHold();
      return;
    }

    if (selected) {
      hapticImpact('light');
      onRemove();
      return;
    }
    abort();
  }, [disabled, selected, onRemove, abort, cancelHold]);

  const filling = progress > 0;

  return (
    <button
      type="button"
      data-bet-button
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      // The browser fires this when it takes over to scroll — the real signal
      // that the user meant to pan, not press.
      onPointerCancel={abort}
      onContextMenu={(e) => e.preventDefault()}
      aria-pressed={selected}
      // touch-pan-y, NOT touch-none: the browser keeps ownership of vertical
      // scrolling, so a swipe that happens to start on a bet button still
      // scrolls the board.
      className={`relative overflow-hidden touch-pan-y ${className} ${selected ? selectedClassName : ''}`}
      style={flash ? { animation: 'pickPop .28s ease-out' } : undefined}
    >
      {/* Fill sweep — sits behind the content, never intercepts pointers. */}
      {filling && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 pointer-events-none"
          style={{
            width: `${progress * 100}%`,
            background: flash
              ? 'color-mix(in srgb, var(--c-pick) 42%, transparent)'
              : 'color-mix(in srgb, var(--c-pick) 26%, transparent)',
            borderRight: flash ? 'none' : '2px solid var(--c-pick)',
          }}
        />
      )}

      {/* Unambiguous "it took" marker. Absolutely positioned so it costs the
          card no height. */}
      {selected && (
        <span
          aria-hidden
          className="absolute top-1 right-1 w-4 h-4 rounded-full bg-pick flex items-center justify-center pointer-events-none"
        >
          <span className="text-[10px] font-black leading-none text-[#06080F]">✓</span>
        </span>
      )}

      <span className="relative flex flex-col items-center w-full">{children}</span>
    </button>
  );
}

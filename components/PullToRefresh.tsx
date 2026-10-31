'use client';

// Swipe down at the top of a page to refresh — the Instagram / TikTok / Teams
// gesture.
//
// What it refreshes: everything this client reads from Supabase — picks,
// rating, sport ratings, friends' standings, and any newly-synced games. It
// deliberately does NOT hit The Odds API, so pulling costs zero odds credits
// no matter how often it's used.
//
// Why touch events and not pointer events: HoldToPick calls
// setPointerCapture() on press, which retargets all subsequent pointer events
// to that button — an ancestor listening for pointermove would simply never
// see them. Touch events aren't affected by pointer capture, so the gesture
// keeps working even when the pull starts on a bet button.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/lib/userStore';
import { hapticImpact, hapticSuccess } from '@/lib/haptics';
import { isPullToRefreshLocked } from '@/lib/pullRefreshLock';

const TRIGGER_PX   = 72;   // pull past this and release to refresh
const MAX_PULL_PX  = 120;  // visual ceiling
const START_SLOP_PX = 8;   // ignore the first few px so taps/holds aren't pulls
const MIN_SPIN_MS  = 450;  // let the spinner be seen even on a fast refresh

export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router  = useRouter();
  const refresh = useUserStore((s) => s.refresh);

  const [pull, setPull]             = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Drives the transition below. Must be state, not a ref — the render reads it.
  const [dragging, setDragging]     = useState(false);

  const startY   = useRef(0);
  const active   = useRef(false);
  const armed    = useRef(false);
  const busy     = useRef(false);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    hapticSuccess();
    const began = Date.now();
    try {
      // Store data (picks / rating / friends nonce) and the server component
      // (the games board) in parallel.
      await Promise.all([refresh(), Promise.resolve(router.refresh())]);
    } catch {
      /* a failed refresh just leaves what's on screen */
    }
    const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - began));
    setTimeout(() => {
      setRefreshing(false);
      setPull(0);
      busy.current = false;
    }, wait);
  }, [refresh, router]);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1) return;
      // A swipe that begins inside a bottom sheet belongs to that sheet. This
      // listener is on `document`, so without the check a flick dismissing a
      // sheet also fed the pull underneath it — overshoot the sheet's
      // threshold and the page reloaded.
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-sheet], [role="dialog"]')) return;
      // And for the moment just after a sheet closes, while the finger is
      // usually still moving.
      if (isPullToRefreshLocked()) return;
      // Only arm at the very top of the document, so normal scrolling is
      // never hijacked.
      if (window.scrollY > 0) return;
      active.current = true;
      armed.current  = false;
      startY.current = e.touches[0].clientY;
      setDragging(true);
    };

    const onMove = (e: TouchEvent) => {
      if (!active.current || busy.current) return;
      const dy = e.touches[0].clientY - startY.current;

      // Upward, or scrolled away from the top mid-gesture → not a pull.
      if (dy <= START_SLOP_PX || window.scrollY > 0) {
        setPull(0);
        active.current = false;
        setDragging(false);
        return;
      }

      // Resistance curve: generous at first, stiffening toward the ceiling.
      const eased = Math.min(MAX_PULL_PX, (dy - START_SLOP_PX) ** 0.85);
      setPull(eased);

      if (!armed.current && eased >= TRIGGER_PX) {
        armed.current = true;
        hapticImpact('medium');
      } else if (armed.current && eased < TRIGGER_PX) {
        armed.current = false;
      }

      // Stop the page itself from moving while the indicator is showing.
      if (e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      if (!active.current) return;
      active.current = false;
      setDragging(false);
      if (armed.current) { armed.current = false; run(); }
      else setPull(0);
    };

    // touchmove must be non-passive for preventDefault() to be honoured.
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove',  onMove,  { passive: false });
    document.addEventListener('touchend',   onEnd,   { passive: true });
    document.addEventListener('touchcancel', onEnd,  { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove',  onMove);
      document.removeEventListener('touchend',   onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [run]);

  const visible  = pull > 0 || refreshing;
  const progress = Math.min(1, pull / TRIGGER_PX);
  const offset   = refreshing ? TRIGGER_PX * 0.55 : pull * 0.55;

  return (
    <>
      {/* Indicator. Sits under the fixed top bar and slides in with the pull. */}
      {visible && (
        <div
          aria-hidden
          className="fixed left-0 right-0 z-30 flex justify-center pointer-events-none"
          style={{
            top: `calc(3rem + env(safe-area-inset-top))`,
            transform: `translateY(${offset - 28}px)`,
            transition: dragging ? 'none' : 'transform .25s cubic-bezier(0.32,0.72,0,1)',
            opacity: refreshing ? 1 : Math.min(1, progress * 1.3),
          }}
        >
          <div className="w-9 h-9 rounded-full bg-card border border-rim shadow-lg flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="w-4.5 h-4.5"
              style={{
                width: 18, height: 18,
                transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
                animation: refreshing ? 'ptrSpin .7s linear infinite' : undefined,
              }}
            >
              <circle
                cx="12" cy="12" r="9" fill="none"
                stroke="var(--c-rim)" strokeWidth="2.5"
              />
              <circle
                cx="12" cy="12" r="9" fill="none"
                stroke="var(--c-accent)" strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={Math.PI * 2 * 9}
                strokeDashoffset={Math.PI * 2 * 9 * (refreshing ? 0.75 : 1 - progress)}
                transform="rotate(-90 12 12)"
              />
            </svg>
          </div>
        </div>
      )}

      {/* The page follows the finger, which is what makes the pull feel real. */}
      <div
        style={{
          transform: offset > 0 ? `translateY(${offset}px)` : undefined,
          transition: dragging ? 'none' : 'transform .25s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        {children}
      </div>
    </>
  );
}

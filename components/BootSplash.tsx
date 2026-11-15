'use client';

// The screen you see while the app starts.
//
// It is the logo, redrawn as shapes so it can move: the three bars rise from
// the baseline, a ball drops onto each, and the balls keep bouncing in a slow
// wave until the app is ready. The same picture as the home-screen icon, so
// launch reads as the icon opening rather than as a blank page followed by a
// grey skeleton.
//
// It is rendered on the server into the very first paint, then removes itself
// once the account has loaded. Because it lives in the root layout it only
// ever appears on a cold start — moving between tabs does not remount the
// layout, so it never flashes during ordinary use.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useUserStore } from '@/lib/userStore';

/** Long enough for the bars to rise and the balls to land, so it never reads as a flicker. */
const MIN_MS = 1100;
/** Never hold the app hostage to a slow request. */
const MAX_MS = 4000;
const FADE_MS = 350;

// Screens that are not the app: sign-in, legal pages, public profiles and
// invite pages are opened in a browser by people who should just see them.
const NO_SPLASH = ['/sign-in', '/sign-up', '/invite', '/privacy', '/terms', '/profile'];

const INK = '#1A1033';

/** The logo mark. Animation is entirely in CSS (see globals.css, "Boot splash"). */
export function SplashArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="92 78 328 344" className={className} role="img" aria-label="BallIQ">
      {/* Bars, shortest to tallest: the climb. */}
      <rect className="splash-bar splash-bar-1" x="115" y="310" width="70" height="100" rx="20" fill="#5B21B6" />
      <rect className="splash-bar splash-bar-2" x="221" y="246" width="70" height="164" rx="20" fill="#7C3AED" />
      <rect className="splash-bar splash-bar-3" x="327" y="180" width="70" height="230" rx="20" fill="#A78BFA" />

      {/* Basketball */}
      <g className="splash-drop splash-drop-1">
        <g className="splash-hop splash-hop-1">
          <circle cx="150" cy="264" r="38" fill="#F97316" />
          <g fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round">
            <path d="M150 226v76M112 264h76" />
            <path d="M124 236q26 28 0 56M176 236q-26 28 0 56" />
          </g>
        </g>
      </g>

      {/* Football */}
      <g className="splash-drop splash-drop-2">
        <g className="splash-hop splash-hop-2">
          <g transform="rotate(-22 256 200)">
            <ellipse cx="256" cy="200" rx="46" ry="27" fill="#9A4B1F" />
            <g fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round">
              <path d="M238 200h36M244 194v12M252 194v12M260 194v12M268 194v12" />
              <path d="M223 185q-7 15 0 30M289 185q7 15 0 30" strokeWidth="3" />
            </g>
          </g>
        </g>
      </g>

      {/* Soccer ball */}
      <g className="splash-drop splash-drop-3">
        <g className="splash-hop splash-hop-3">
          <circle cx="362" cy="134" r="36" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
          <polygon points="362,121 374.4,130 369.6,144.5 354.4,144.5 349.6,130" fill={INK} />
          <g stroke={INK} strokeWidth="5" strokeLinecap="round">
            <path d="M362 121V99M374.4 130l20 -6.5M369.6 144.5l12.6 17M354.4 144.5l-12.6 17M349.6 130l-20 -6.5" />
          </g>
        </g>
      </g>
    </svg>
  );
}

export default function BootSplash() {
  const pathname = usePathname();
  const hydrated = useUserStore((s) => s.hydrated);

  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  // When this component first ran in the browser; the minimum is measured from it.
  const [bornAt] = useState(() => (typeof performance === 'undefined' ? 0 : performance.now()));

  const skip = NO_SPLASH.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (skip || gone) return;
    // Leave when the account has loaded, but not before the entrance has had
    // time to play, and not later than the cap whatever happens.
    const elapsed = performance.now() - bornAt;
    const wait = hydrated ? Math.max(0, MIN_MS - elapsed) : Math.max(0, MAX_MS - elapsed);
    let fade: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      setLeaving(true);
      fade = setTimeout(() => setGone(true), FADE_MS);
    }, wait);
    return () => { clearTimeout(timer); if (fade) clearTimeout(fade); };
  }, [hydrated, skip, gone, bornAt]);

  if (skip || gone) return null;

  return (
    <div
      aria-hidden
      className={`boot-splash fixed inset-0 z-[200] bg-base flex flex-col items-center justify-center ${leaving ? 'boot-splash-out' : ''}`}
    >
      <SplashArt className="w-44 h-44" />
      <p className="splash-word mt-4 text-2xl font-black text-ink tracking-tight">BallIQ</p>
    </div>
  );
}

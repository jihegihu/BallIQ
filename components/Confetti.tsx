'use client';

// A short, cheap confetti burst for the post-settle recap. Pure CSS transforms
// on ~28 divs — no canvas, no library. Fires once, cleans itself up, and is
// suppressed entirely under prefers-reduced-motion (see globals.css).
//
// Piece layout comes from a hash of the index rather than Math.random(): it
// keeps the component pure (no random during render, no effect needed) and a
// 2.6-second decoration gains nothing from true randomness.

import { useEffect, useState } from 'react';

const COUNT = 28;
const DURATION_MS = 2600;

const COLORS = ['#34D399', '#22D3EE', '#A78BFA', '#FBBF24', '#F472B6'];

/** Deterministic 0→1 "noise" for piece `i`, channel `salt`. */
function noise(i: number, salt: number): number {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const PIECES = Array.from({ length: COUNT }, (_, i) => ({
  id:       i,
  left:     noise(i, 1) * 100,
  drift:    `${(noise(i, 2) - 0.5) * 140}px`,
  spin:     `${360 + noise(i, 3) * 540}deg`,
  delay:    noise(i, 4) * 450,
  duration: 1800 + noise(i, 5) * 800,
  color:    COLORS[i % COLORS.length],
  width:    5 + noise(i, 6) * 4,
  height:   9 + noise(i, 7) * 6,
  round:    noise(i, 8) > 0.7,
}));

export default function Confetti() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDone(true), DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  if (done) return null;

  return (
    <div
      data-confetti
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[95] overflow-hidden"
    >
      {PIECES.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 block"
          style={{
            left:            `${p.left}%`,
            width:           p.width,
            height:          p.height,
            background:      p.color,
            borderRadius:    p.round ? '50%' : 1,
            ['--drift' as string]: p.drift,
            ['--spin'  as string]: p.spin,
            animation:       `confettiFall ${p.duration}ms cubic-bezier(0.22,0.61,0.36,1) ${p.delay}ms forwards`,
          }}
        />
      ))}
    </div>
  );
}

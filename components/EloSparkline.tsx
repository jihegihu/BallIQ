'use client';

// 30-day rating trend — a compact area sparkline. Deliberately small: it's a
// glanceable "am I climbing?", not an analytics dashboard.

import { useMemo } from 'react';
import { useUserStore } from '@/lib/userStore';
import { buildEloHistory } from '@/lib/eloHistory';

const W = 320;   // viewBox units; the SVG scales to its container
const H = 64;
const PAD_Y = 6;

export default function EloSparkline({ days = 30 }: { days?: number }) {
  const picks     = useUserStore((s) => s.user.picks);
  const globalElo = useUserStore((s) => s.user.globalElo);

  const series = useMemo(
    () => buildEloHistory(picks, globalElo, days),
    [picks, globalElo, days],
  );

  if (series.length < 2) return null;

  const values = series.map((p) => p.elo);
  const min    = Math.min(...values);
  const max    = Math.max(...values);
  const span   = Math.max(1, max - min);

  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => PAD_Y + (1 - (v - min) / span) * (H - PAD_Y * 2);

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;

  const net  = values[values.length - 1] - values[0];
  const up   = net >= 0;
  // CSS var, not a literal: the dark-mode steps are illegible on a light card
  // (emerald-400 is 1.92:1 on white). --c-good / --c-bad flip with the theme.
  const tone = up ? 'var(--c-good)' : 'var(--c-bad)';

  return (
    <div className="bg-card border border-rim rounded-2xl p-3.5">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-xs text-dim uppercase tracking-widest font-bold">
          Last {days} days
        </p>
        <p className={`text-xs font-black tabular-nums ${up ? 'text-good' : 'text-bad'}`}>
          {up ? '▲ +' : '▼ '}{Math.abs(net)} Elo
        </p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-16 block"
        role="img"
        aria-label={`Rating ${up ? 'up' : 'down'} ${Math.abs(net)} points over ${days} days`}
      >
        <defs>
          <linearGradient id="eloFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={tone} stopOpacity="0.28" />
            <stop offset="100%" stopColor={tone} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#eloFade)" />
        <path
          d={line}
          fill="none"
          stroke={tone}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Today's value */}
        <circle
          cx={x(series.length - 1)}
          cy={y(values[values.length - 1])}
          r="3"
          fill={tone}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="flex justify-between mt-1">
        <span className="text-xs text-dim tabular-nums">low {min.toLocaleString()}</span>
        <span className="text-xs text-dim tabular-nums">high {max.toLocaleString()}</span>
      </div>
    </div>
  );
}

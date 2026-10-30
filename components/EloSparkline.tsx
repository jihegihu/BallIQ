'use client';

// 30-day rating trend. A glanceable "am I climbing?", not an analytics panel.
//
// Two things were wrong with the first version. The y-domain was exactly
// [min, max], so the line always touched both edges of the box and a 30-point
// drift looked identical to a 300-point collapse. And it was captioned "low
// 1211 / high 1241" — the two numbers a rating chart is least about. What the
// user actually wants to read is: where did I start, where am I now, and which
// way is the line going.

import { useMemo } from 'react';
import { useUserStore } from '@/lib/userStore';
import { buildEloHistory } from '@/lib/eloHistory';

const W = 320;   // viewBox units; the SVG scales to its container
const H = 72;
const PAD_Y = 8;

function shortDate(day: string): string {
  // `day` is YYYY-MM-DD in Eastern; parse as local to avoid a UTC shift.
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function EloSparkline({ days = 30 }: { days?: number }) {
  const picks     = useUserStore((s) => s.user.picks);
  const globalElo = useUserStore((s) => s.user.globalElo);

  const series = useMemo(
    () => buildEloHistory(picks, globalElo, days),
    [picks, globalElo, days],
  );

  if (series.length < 2) return null;

  const values = series.map((p) => p.elo);
  const first  = values[0];
  const last   = values[values.length - 1];
  const min    = Math.min(...values);
  const max    = Math.max(...values);

  // Breathing room above and below, so the line never kisses the frame and a
  // small move reads as a small move. At least 8 Elo even when the range is
  // almost flat, which is the common case over a short window.
  const pad = Math.max(8, (max - min) * 0.3);
  const lo  = min - pad;
  const hi  = max + pad;
  const span = Math.max(1, hi - lo);

  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => PAD_Y + (1 - (v - lo) / span) * (H - PAD_Y * 2);

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;

  const net  = last - first;
  const up   = net >= 0;
  const tone = up ? 'var(--c-good)' : 'var(--c-bad)';

  return (
    <div className="bg-card border border-rim rounded-xl px-3 py-2.5">
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-xs text-dim uppercase tracking-widest font-bold">
          Last {days} days
        </p>
        <p className={`text-xs font-black tabular-nums ${up ? 'text-good' : 'text-bad'}`}>
          {up ? '+' : '−'}{Math.abs(net)} Elo
        </p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-[72px] block"
        role="img"
        aria-label={`Rating ${up ? 'up' : 'down'} ${Math.abs(net)} points over ${days} days, from ${first} to ${last}`}
      >
        <defs>
          <linearGradient id="eloFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={tone} stopOpacity="0.26" />
            <stop offset="100%" stopColor={tone} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Where you started — the only reference line that means anything on
            a rating chart. Everything above it is progress. */}
        <line
          x1="0" x2={W} y1={y(first)} y2={y(first)}
          stroke="var(--c-rim)" strokeWidth="1" strokeDasharray="3 4"
          vectorEffect="non-scaling-stroke"
        />

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
        <circle cx={x(series.length - 1)} cy={y(last)} r="3.5" fill={tone} vectorEffect="non-scaling-stroke" />
      </svg>

      {/* Start → now. The two numbers that actually tell the story, replacing
          the old low/high caption. */}
      <div className="flex items-baseline justify-between mt-1">
        <span className="text-xs text-dim tabular-nums">
          {first.toLocaleString()} <span className="text-dim/70">· {shortDate(series[0].day)}</span>
        </span>
        <span className="text-xs font-black text-ink tabular-nums">
          {last.toLocaleString()} <span className="text-dim font-bold">now</span>
        </span>
      </div>
    </div>
  );
}

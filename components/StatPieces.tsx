'use client';

// The building blocks the stats screens are made of.
//
// None of these is a chart. A win rate is one number, and the previous version
// drew a bar filled to 63% right next to the text "63%" — the same fact twice,
// with the bar adding nothing a reader could not get from the figure. A table
// of figures is the honest form for a handful of categories, so that is what a
// breakdown is now.
//
// Colour: net Elo is polarity, so it uses the good/bad pair, and because that
// pair is a red/green collision for colour-vision deficiency it always carries
// a +/− sign as well. Nothing here is told apart by hue alone.

import type { StatRow } from '@/lib/playerStats';

/** A headline number. Just the figure and what it is. */
export function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'good' | 'bad';
}) {
  const toneCls = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink';
  return (
    <div className="bg-card border border-rim rounded-xl px-3 py-2.5">
      <p className="text-xs text-dim uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-black tabular-nums leading-tight mt-0.5 ${toneCls}`}>{value}</p>
      {sub && <p className="text-xs text-dim tabular-nums">{sub}</p>}
    </div>
  );
}

/** Signed Elo, coloured by direction. The sign does the work; the colour agrees with it. */
export function NetElo({ value, className = '' }: { value: number; className?: string }) {
  const tone = value > 0 ? 'text-good' : value < 0 ? 'text-bad' : 'text-dim';
  return (
    <span className={`tabular-nums ${tone} ${className}`}>
      {value > 0 ? '+' : value < 0 ? '−' : ''}{Math.abs(value)}
    </span>
  );
}

/**
 * Categories side by side: record, win rate, and the Elo each produced.
 * Columns line up down the card so the eye can run down any one of them.
 */
export function BreakdownTable({ title, rows }: { title: string; rows: StatRow[] }) {
  if (rows.length === 0) return null;
  const cols = 'grid grid-cols-[minmax(0,1fr)_3.75rem_2.75rem_3.25rem] gap-x-2 items-baseline';
  return (
    <div className="bg-card border border-rim rounded-xl px-3 py-2.5">
      <div className={`${cols} pb-1.5 mb-0.5 border-b border-rim text-[10px] text-dim uppercase tracking-wide`}>
        <span className="font-bold tracking-widest">{title}</span>
        <span className="text-right">Record</span>
        <span className="text-right">Win</span>
        <span className="text-right">Elo</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className={`${cols} py-1.5`}>
          <span className="text-sm font-bold text-ink truncate">{r.name}</span>
          <span className="text-right text-xs text-sub tabular-nums">
            {r.wins}–{r.losses}{r.pushes > 0 ? `–${r.pushes}` : ''}
          </span>
          <span className="text-right text-xs font-bold text-ink tabular-nums">
            {r.winRate === null ? '—' : `${r.winRate}%`}
          </span>
          <NetElo value={r.net} className="text-right text-sm font-black" />
        </div>
      ))}
    </div>
  );
}

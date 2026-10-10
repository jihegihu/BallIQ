'use client';

// The two building blocks the stats panel is made of.
//
// Written as shared pieces because the panel previously rendered the same
// shape — a category with a win rate and a net Elo — two different ways: "By
// Pick Type" as labelled bar rows, "By Sport" as nested cards with three
// lines of 9px text. Same data job, so it gets one component.
//
// Colour follows the rules for the job each number does:
//   * the win-rate meter encodes MAGNITUDE, so it is a single hue (accent),
//     light to dark by fill — never a per-category hue.
//   * net Elo encodes POLARITY, so it uses the good/bad pair. That pair is a
//     red/green collision for colour-vision deficiency (ΔE 6.5 deutan), so it
//     always ships with a +/− sign as secondary encoding, never hue alone.

/** A headline number. Not a chart — just the figure and what it is. */
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

/**
 * One category: name, a win-rate meter, and the net Elo it produced.
 * `rate` is 0–100; `net` is signed.
 */
export function BreakdownRow({
  name,
  record,
  rate,
  net,
}: {
  name: string;
  record: string;
  rate: number;
  net: number;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <div className="w-24 shrink-0 min-w-0">
        <p className="text-sm font-bold text-ink truncate">{name}</p>
        <p className="text-xs text-dim tabular-nums">{record}</p>
      </div>

      {/* Magnitude meter: one hue, 4px rounded end anchored to the baseline,
          thin mark, recessive track. */}
      <div className="flex-1 min-w-0">
        <div className="h-2 bg-layer rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full"
            style={{ width: `${Math.max(2, rate)}%` }}
          />
        </div>
      </div>

      <p className="w-9 text-right text-xs font-bold text-sub tabular-nums shrink-0">{rate}%</p>
      {/* Sign carries the polarity so hue is never doing it alone. */}
      <p className={`w-12 text-right text-sm font-black tabular-nums shrink-0 ${net >= 0 ? 'text-good' : 'text-bad'}`}>
        {net >= 0 ? '+' : '−'}{Math.abs(net)}
      </p>
    </div>
  );
}

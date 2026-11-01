'use client';

// Where you sit on the whole ladder.
//
// The leaderboard only ever shows the top 50, so anyone outside it had no way
// to tell whether they were near the top or the bottom. That is the thing that
// makes a ladder motivating, so this shows the full climb: every tier, how many
// players are in each, where you are, and exactly what the next rung costs.
//
// Deliberately not a stat tile. The shape of the population is the content —
// seeing a crowd below you and thin air above is what makes the next tier feel
// worth reaching.

import { useThemeStore } from '@/lib/themeStore';
import { tierStyle, tierFor, nextTierProgress } from '@/lib/tiers';
import Icon from '@/components/Icon';

export type Standing = {
  myElo: number | null;
  percentile: number | null;
  /** How many other players are below this user. */
  ahead: number;
  totalRated: number;
  distribution: { label: string; min: number; max: number | null; count: number }[];
};

export default function TierStanding({ standing }: { standing: Standing | null }) {
  const theme = useThemeStore((s) => s.theme);
  if (!standing || standing.myElo == null) return null;

  const { myElo, percentile, ahead, totalRated, distribution } = standing;
  const myTier = tierFor(myElo).label;
  const next   = nextTierProgress(myElo);
  const peak   = Math.max(1, ...distribution.map((d) => d.count));

  return (
    <section className="bg-card border border-rim rounded-2xl px-3.5 py-3 mb-4 elev-1">
      <div className="flex items-baseline justify-between mb-2.5">
        <h2 className="text-xs font-black text-ink uppercase tracking-widest">Your climb</h2>
        {percentile !== null && totalRated > 1 && (
          <p className="text-xs text-dim">
            {/* A percentage of eight people is noise; name the real number
                until the base is large enough for a percentage to mean
                something. */}
            ahead of{' '}
            <span className="font-black text-ink tabular-nums">
              {totalRated >= 25 ? `${percentile}%` : ahead}
            </span>{' '}
            of {totalRated - 1} other{totalRated - 1 === 1 ? '' : 's'}
          </p>
        )}
      </div>

      {/* The ladder, highest rung first — so climbing reads as moving up. */}
      <div className="flex flex-col-reverse gap-px">
        {distribution.map((d) => {
          const here  = d.label === myTier;
          const below = myElo >= d.min;             // rungs already climbed
          const color = tierStyle(d.min, theme).color;
          const width = Math.max(d.count > 0 ? 6 : 0, (d.count / peak) * 100);

          return (
            <div
              key={d.label}
              className={`relative flex items-center gap-2 rounded-lg px-2 py-1 ${here ? 'bg-layer' : ''}`}
            >
              {/* Population bar, behind the text — the shape IS the information. */}
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 rounded-lg pointer-events-none"
                style={{
                  width: `${width}%`,
                  background: color,
                  opacity: here ? 0.26 : below ? 0.14 : 0.07,
                }}
              />

              <span className="relative w-3.5 shrink-0">
                {here && <Icon name="diamond" size={11} style={{ color }} />}
              </span>

              <span
                className={`relative flex-1 min-w-0 truncate text-xs ${here ? 'font-black' : 'font-bold'}`}
                style={{ color: here ? color : undefined }}
              >
                <span className={here ? '' : below ? 'text-sub' : 'text-dim'}>{d.label}</span>
              </span>

              <span className="relative text-xs text-dim tabular-nums shrink-0">
                {d.min.toLocaleString()}
                {d.max !== null ? `–${d.max.toLocaleString()}` : '+'}
              </span>

              <span className={`relative w-7 text-right text-xs tabular-nums shrink-0 ${here ? 'text-ink font-black' : 'text-dim'}`}>
                {d.count || '—'}
              </span>
            </div>
          );
        })}
      </div>

      {/* The ask: one number, and what it buys. */}
      {next ? (
        <div className="mt-2.5 pt-2.5 border-t border-rim">
          <div className="flex items-baseline justify-between mb-1.5">
            <p className="text-xs text-sub">
              <span className="font-black text-ink tabular-nums">{next.toGo}</span> Elo to{' '}
              <span className="font-black" style={{ color: tierStyle(next.toGo + myElo, theme).color }}>
                {next.label}
              </span>
            </p>
            <p className="text-xs text-dim tabular-nums">{next.percent}%</p>
          </div>
          <div className="h-1.5 bg-layer rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${next.percent}%`, background: tierStyle(myElo, theme).color }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-2.5 pt-2.5 border-t border-rim text-xs text-sub">
          Top of the ladder — nothing above but holding it.
        </p>
      )}
    </section>
  );
}

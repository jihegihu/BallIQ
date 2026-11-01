'use client';

// Your climb up the ladder.
//
// The first version was a histogram: every row carried a tier name, an Elo
// range, a population count, a bar whose width encoded that count, AND an
// opacity that encoded it again. Three encodings of one fact plus two numbers
// nobody asked for, so it read as decoration.
//
// This is a path instead. One mark per tier showing only whether you have
// passed it, are standing on it, or have yet to reach it. Numbers appear
// exactly three times: your rating, the gap to the next rung, and where you
// sit among other players.

import { useThemeStore } from '@/lib/themeStore';
import { tierStyle, tierFor, nextTierProgress, TIERS } from '@/lib/tiers';
import Icon from '@/components/Icon';

export type Standing = {
  myElo: number | null;
  percentile: number | null;
  /** How many other players are below this user. */
  ahead: number;
  /** Competition rank: everyone strictly above, plus one. Ties share a rank. */
  rank: number | null;
  totalRated: number;
  distribution: { label: string; min: number; max: number | null; count: number }[];
};

export default function TierStanding({ standing }: { standing: Standing | null }) {
  const theme = useThemeStore((s) => s.theme);

  if (!standing || standing.myElo == null) {
    return (
      <p className="text-center text-sm text-dim py-10">
        Make a pick to take your place on the ladder.
      </p>
    );
  }

  const { myElo, percentile, rank, totalRated } = standing;
  const myTier = tierFor(myElo).label;
  const next   = nextTierProgress(myElo);
  const myIdx  = TIERS.findIndex((t) => t.label === myTier);   // 0 = top rung

  return (
    <section className="bg-card border border-rim rounded-2xl px-4 py-3.5 elev-1">
      {/* Rungs run top-down from the highest, so the climb reads upward. */}
      <ol className="relative">
        {TIERS.map((t, i) => {
          const here    = i === myIdx;
          const reached = i > myIdx;            // lower index = higher tier
          const isNext  = i === myIdx - 1;
          const color   = tierStyle(t.min, theme).color;
          const last    = i === TIERS.length - 1;

          return (
            <li key={t.label} className="relative flex items-center gap-3 h-9">
              {/* The rail connecting the rungs. */}
              {!last && (
                <span
                  aria-hidden
                  className="absolute left-[7px] top-[18px] bottom-[-18px] w-px"
                  style={{ background: reached || here ? color : 'var(--c-rim)', opacity: reached || here ? 0.45 : 1 }}
                />
              )}

              {/* One mark, three states: climbed, standing, still above you. */}
              <span className="relative z-10 w-4 flex justify-center shrink-0">
                {here ? (
                  <Icon name="diamond" size={15} style={{ color }} />
                ) : (
                  <span
                    className="block w-2 h-2 rounded-full"
                    style={
                      reached
                        ? { background: color, opacity: 0.75 }
                        : { border: '1.5px solid var(--c-rim)' }
                    }
                  />
                )}
              </span>

              <span
                className={`flex-1 min-w-0 truncate ${here ? 'text-sm font-black' : 'text-sm font-bold'}`}
                style={{ color: here ? color : undefined }}
              >
                <span className={here ? '' : reached ? 'text-sub' : 'text-dim'}>{t.label}</span>
                {here && (
                  <span className="ml-2 text-xs font-bold text-dim tabular-nums">
                    {myElo.toLocaleString()}
                  </span>
                )}
              </span>

              {isNext && next && (
                <span className="text-xs text-dim tabular-nums">
                  <span className="font-black text-ink">{next.toGo}</span> to go
                </span>
              )}

              {/* Where the rung begins. The row above gives its ceiling, so a
                  range would be two numbers saying one thing. */}
              <span className={`w-12 text-right text-xs tabular-nums shrink-0 ${here ? 'font-black' : 'text-dim'}`}
                    style={here ? { color } : undefined}>
                {t.min.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ol>

      {next && (
        <div className="mt-3 pt-3 border-t border-rim">
          <div className="h-1.5 bg-layer rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${next.percent}%`, background: tierStyle(myElo, theme).color }}
            />
          </div>
        </div>
      )}

      {totalRated > 1 && rank !== null && (
        <div className="flex items-baseline justify-between mt-3 pt-3 border-t border-rim">
          <p className="text-xs text-dim">
            Rank <span className="font-black text-ink tabular-nums">{rank}</span>
            <span className="tabular-nums"> of {totalRated}</span>
          </p>
          {percentile !== null && (
            <p className="text-xs text-dim">
              ahead of <span className="font-black text-ink tabular-nums">{percentile}%</span> of players
            </p>
          )}
        </div>
      )}
    </section>
  );
}

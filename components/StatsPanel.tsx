'use client';

// The Stats tab on My Picks.
//
// It used to be a collapsed strip most people never opened, holding a record
// shown three ways and two breakdowns with a bar repeating each percentage.
// It is now a tab of its own, ordered by what a player wants to know:
//
//   1. How am I doing        — record, win rate, net Elo
//   2. How am I doing lately — the last ten results in order, and the run
//   3. Where it comes from   — by sport, by pick type, favourites vs underdogs
//
// The last-ten strip is the one mark here that is not a plain figure, and it
// earns that: order is the information, and a percentage cannot show whether
// seven wins came first or last.

import { useMemo } from 'react';
import Icon from '@/components/Icon';
import EloSparkline from '@/components/EloSparkline';
import TournamentRecaps from '@/components/TournamentRecaps';
import { StatTile, BreakdownTable, NetElo } from '@/components/StatPieces';
import { computePlayerStats, type StatRow } from '@/lib/playerStats';
import type { UserPick } from '@/types';

function Note({ icon, tone, label, row }: { icon: 'trendUp' | 'trendDown'; tone: string; label: string; row: StatRow }) {
  return (
    <p className="flex items-baseline gap-2 text-sm text-sub">
      <Icon name={icon} size={14} className={`${tone} shrink-0 translate-y-0.5`} />
      <span className="min-w-0">
        {label} <span className="font-black text-ink">{row.name}</span>
        <span className="text-dim">, </span>
        <NetElo value={row.net} className="font-black" />
        <span className="text-dim"> Elo over {row.decided} picks</span>
      </span>
    </p>
  );
}

export default function StatsPanel({ results, allPicks }: { results: UserPick[]; allPicks: UserPick[] }) {
  const s = useMemo(() => computePlayerStats(results), [results]);

  if (s.decided === 0) {
    return (
      <div className="text-center py-16">
        <Icon name="barChart" size={40} strokeWidth={1.25} className="mx-auto mb-3 text-dim" />
        <p className="font-bold text-ink mb-1">No stats yet</p>
        <p className="text-sm text-dim">They build up as your picks settle.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* ── Record ─────────────────────────────────────────────────────────── */}
      <section className="bg-card border border-rim rounded-2xl px-4 py-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-4xl font-black text-ink tabular-nums leading-none tracking-tight">
              {s.wins}<span className="text-dim mx-0.5">–</span>{s.losses}
            </p>
            <p className="text-xs text-dim mt-1.5">
              wins and losses{s.pushes > 0 ? `, ${s.pushes} push${s.pushes > 1 ? 'es' : ''}` : ''}
            </p>
          </div>
          <div className="flex gap-5 text-right">
            <div>
              <p className="text-xl font-black text-ink tabular-nums leading-none">{s.winRate}%</p>
              <p className="text-xs text-dim mt-1.5">win rate</p>
            </div>
            <div>
              <NetElo value={s.net} className="block text-xl font-black leading-none" />
              <p className="text-xs text-dim mt-1.5">net Elo</p>
            </div>
          </div>
        </div>

        {/* Last ten, oldest to newest. The letter carries the result, so the
            strip reads the same without colour. */}
        <div className="mt-4 pt-3 border-t border-rim">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-dim">
              Last {s.form.length}, newest on the right
            </p>
            <p className="text-xs font-bold text-sub tabular-nums">
              {s.form.filter((f) => f === 'W').length}–{s.form.filter((f) => f === 'L').length}
            </p>
          </div>
          <ol className="flex gap-1" aria-label="Recent results, oldest first">
            {s.form.map((f, i) => (
              <li
                key={i}
                className={`flex-1 h-7 max-w-9 rounded-md flex items-center justify-center text-[11px] font-black ${
                  f === 'W' ? 'bg-good/15 text-good' : 'bg-bad/10 text-bad'
                }`}
              >
                {f}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Runs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="Right now"
          value={s.run ? `${s.run.kind}${s.run.length}` : '—'}
          sub={s.run ? (s.run.kind === 'W' ? 'wins in a row' : 'losses in a row') : undefined}
          tone={s.run ? (s.run.kind === 'W' ? 'good' : 'bad') : 'neutral'}
        />
        <StatTile label="Best run" value={s.bestRun > 0 ? String(s.bestRun) : '—'} sub={s.bestRun > 0 ? 'wins in a row' : undefined} />
        <StatTile label="Best pick" value={s.bestPick > 0 ? `+${s.bestPick}` : '—'} sub={s.bestPick > 0 ? 'Elo' : undefined} tone={s.bestPick > 0 ? 'good' : 'neutral'} />
      </div>

      {/* ── What to do more and less of ────────────────────────────────────── */}
      {(s.strongest || s.weakest) && (
        <div className="bg-card border border-rim rounded-xl px-3 py-3 flex flex-col gap-1.5">
          {s.strongest && <Note icon="trendUp" tone="text-good" label="Strongest:" row={s.strongest} />}
          {s.weakest && <Note icon="trendDown" tone="text-bad" label="Costing you:" row={s.weakest} />}
        </div>
      )}

      {/* Rating over time. Change over time is the one job here a chart does
          better than a number; it draws nothing until there is enough history. */}
      <EloSparkline days={30} />

      {/* ── Where the rating comes from ────────────────────────────────────── */}
      <BreakdownTable title="By sport" rows={s.bySport} />
      <BreakdownTable title="By pick type" rows={s.byType} />
      <BreakdownTable title="By odds" rows={s.byOdds} />

      <TournamentRecaps picks={allPicks} />
    </div>
  );
}

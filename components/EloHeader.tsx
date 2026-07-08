'use client';

import { useState } from 'react';
import { useUserStore } from '@/lib/userStore';
import { Sport } from '@/types';
import { getCurrentSeason, getDaysRemaining } from '@/lib/seasons';

const SPORT_DISPLAY: { key: Sport; label: string }[] = [
  { key: 'NBA',    label: 'NBA' },
  { key: 'NFL',    label: 'NFL' },
  { key: 'MLB',    label: 'MLB' },
  { key: 'NCAA',   label: 'NCAA' },
  { key: 'EPL',    label: 'Soccer' },
  { key: 'TENNIS', label: 'Tennis' },
];

function sportEloRank(elo: number) {
  if (elo >= 2000) return { label: 'Elite',        color: 'text-red-400' };
  if (elo >= 1600) return { label: 'Expert',       color: 'text-orange-400' };
  if (elo >= 1200) return { label: 'Advanced',     color: 'text-accent' };
  if (elo >= 800)  return { label: 'Intermediate', color: 'text-yellow-400' };
  return                  { label: 'Rookie',       color: 'text-sub' };
}

// Progress toward the next tier threshold; null once Elite (no next tier).
function nextTierProgress(elo: number) {
  const TIERS: { at: number; label: string }[] = [
    { at: 800,  label: 'Intermediate' },
    { at: 1200, label: 'Advanced' },
    { at: 1600, label: 'Expert' },
    { at: 2000, label: 'Elite' },
  ];
  const next = TIERS.find((t) => elo < t.at);
  if (!next) return null;
  const floor = TIERS[TIERS.indexOf(next) - 1]?.at ?? 0;
  return {
    label:   next.label,
    toGo:    next.at - elo,
    percent: Math.min(100, Math.max(0, Math.round(((elo - floor) / (next.at - floor)) * 100))),
  };
}

export default function EloHeader() {
  const [open, setOpen] = useState(false);
  const user = useUserStore((s) => s.user);

  const resolved  = user.picks.filter((p) => p.outcome !== 'pending' && p.outcome !== 'cancelled');
  const wins      = resolved.filter((p) => p.outcome === 'win').length;
  const losses    = resolved.filter((p) => p.outcome === 'loss').length;
  const pushes    = resolved.filter((p) => p.outcome === 'push').length;
  const winRate   = resolved.length > 0 ? Math.round((wins / resolved.length) * 100) : null;
  const netElo    = user.globalElo - 1200;
  const biggestWin = resolved.reduce((max, p) => Math.max(max, p.eloDelta ?? 0), 0);

  const eloRank      = sportEloRank(user.globalElo);
  const nextTier     = nextTierProgress(user.globalElo);
  const season       = getCurrentSeason();
  const daysLeft     = season ? getDaysRemaining(season.end) : null;

  return (
    <>
      {/* Fixed top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-base/95 backdrop-blur-sm border-b border-rim">
        <div className="max-w-md mx-auto px-4 h-11 flex items-center justify-end">
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 bg-card border border-rim rounded-full px-3 py-1 hover:border-accent/40 transition-all active:scale-95"
          >
            <span className="text-accent text-[9px]">◆</span>
            <span className="text-ink font-black text-sm tabular-nums">{user.globalElo.toLocaleString()}</span>
            <span className="text-dim text-[10px]">ELO</span>
          </button>
        </div>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Bottom drawer */}
      {open && (
        <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto">
          <div className="bg-card border-t border-rim rounded-t-2xl p-5 pb-8">
            {/* Handle */}
            <div className="w-10 h-1 bg-rim rounded-full mx-auto mb-5" />

            {/* Elo hero */}
            <div className="flex items-end justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[10px] text-dim uppercase tracking-widest">Global Elo</p>
                  {season && (
                    <span className="text-[9px] font-black text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                      {season.name} · {daysLeft}d left
                    </span>
                  )}
                </div>
                <p className="text-5xl font-black text-accent tabular-nums leading-none">{user.globalElo.toLocaleString()}</p>
                <p className={`text-xs font-bold mt-1 ${eloRank.color}`}>◆ {eloRank.label}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-dim uppercase tracking-widest mb-0.5">Record</p>
                <p className="text-2xl font-black text-ink tabular-nums">
                  <span className="text-emerald-400">{wins}</span>
                  <span className="text-dim mx-1">-</span>
                  <span className="text-red-400">{losses}</span>
                  {pushes > 0 && <><span className="text-dim mx-1">-</span><span className="text-sub">{pushes}</span></>}
                </p>
                {winRate !== null && (
                  <p className="text-xs text-sub mt-0.5">{winRate}% win rate</p>
                )}
              </div>
            </div>

            {/* Next tier progress */}
            {nextTier && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-dim uppercase tracking-widest">Next Tier</p>
                  <p className="text-[11px] font-bold text-sub">
                    <span className="text-accent font-black">{nextTier.toGo}</span> Elo to {nextTier.label}
                  </p>
                </div>
                <div className="h-2 bg-layer rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${nextTier.percent}%`, background: 'linear-gradient(90deg, #7C3AED, #A78BFA)' }}
                  />
                </div>
              </div>
            )}

            {/* Season Elo */}
            {season && (
              <div className="flex items-center justify-between bg-layer rounded-xl px-4 py-2.5 mb-5">
                <div>
                  <p className="text-[10px] text-dim uppercase tracking-widest">{season.name} Elo</p>
                  <p className="text-2xl font-black text-ink tabular-nums">{user.seasonElo.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-dim uppercase tracking-widest">Days Left</p>
                  <p className="text-2xl font-black text-accent">{daysLeft}</p>
                </div>
              </div>
            )}

            {/* Quick stats row */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="bg-layer rounded-xl p-3 text-center">
                <p className="text-[10px] text-dim uppercase tracking-wide mb-0.5">Streak</p>
                <p className="text-sm font-black text-accent">{user.currentStreak > 0 ? `${user.currentStreak}🔥` : '—'}</p>
              </div>
              <div className="bg-layer rounded-xl p-3 text-center">
                <p className="text-[10px] text-dim uppercase tracking-wide mb-0.5">Net Elo</p>
                <p className={`text-sm font-black ${netElo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {netElo >= 0 ? '+' : ''}{netElo}
                </p>
              </div>
              <div className="bg-layer rounded-xl p-3 text-center">
                <p className="text-[10px] text-dim uppercase tracking-wide mb-0.5">Best Pick</p>
                <p className="text-sm font-black text-emerald-400">{biggestWin > 0 ? `+${biggestWin}` : '—'}</p>
              </div>
            </div>

            {/* Sport ratings */}
            <p className="text-[10px] text-dim uppercase tracking-widest font-bold mb-2">Sport Ratings</p>
            <div className="grid grid-cols-2 gap-2">
              {SPORT_DISPLAY.map(({ key, label }) => {
                const elo  = user.sportElos[key] ?? 1200;
                const rank = sportEloRank(elo);
                return (
                  <div key={key} className="bg-layer rounded-xl px-3 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-dim font-black uppercase tracking-widest">{label}</p>
                      <p className="text-sm font-black text-ink tabular-nums">{elo.toLocaleString()}</p>
                    </div>
                    <span className={`text-[10px] font-bold ${rank.color}`}>{rank.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

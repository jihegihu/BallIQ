'use client';

// The rating sheet behind the Elo pill. Previously a fixed-height drawer that
// couldn't scroll (sport ratings below the fold were unreachable) and couldn't
// be swiped away. Now it's a proper sheet: drag the handle to dismiss, scroll
// the body for the full sport breakdown.

import { useEffect } from 'react';
import { useUserStore } from '@/lib/userStore';
import { Sport, UserPick } from '@/types';
import { getCurrentSeason, getDaysRemaining } from '@/lib/seasons';
import { useDragDismiss } from '@/lib/useDragDismiss';

// Soccer leagues share a single rating column server-side, so EPL stands in
// for all of them here.
const SPORT_DISPLAY: { key: Sport; label: string; members: Sport[] }[] = [
  { key: 'NBA',    label: 'NBA',    members: ['NBA'] },
  { key: 'NFL',    label: 'NFL',    members: ['NFL'] },
  { key: 'MLB',    label: 'MLB',    members: ['MLB'] },
  { key: 'EPL',    label: 'Soccer', members: ['EPL', 'LALIGA', 'BUNDESLIGA', 'SERIEA', 'WORLDCUP'] },
  { key: 'TENNIS', label: 'Tennis', members: ['TENNIS'] },
  { key: 'NCAA',   label: 'NCAA',   members: ['NCAA'] },
];

export function sportEloRank(elo: number) {
  if (elo >= 2000) return { label: 'Elite',        color: 'text-red-400' };
  if (elo >= 1600) return { label: 'Expert',       color: 'text-orange-400' };
  if (elo >= 1200) return { label: 'Advanced',     color: 'text-accent' };
  if (elo >= 800)  return { label: 'Intermediate', color: 'text-yellow-400' };
  return                  { label: 'Rookie',       color: 'text-sub' };
}

function nextTierProgress(elo: number) {
  const TIERS = [
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

export default function EloSheet({ onClose }: { onClose: () => void }) {
  const user = useUserStore((s) => s.user);
  const { scrollRef, dragHandlers, sheetStyle } = useDragDismiss(onClose);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const resolved   = user.picks.filter((p) => p.outcome !== 'pending' && p.outcome !== 'cancelled');
  const wins       = resolved.filter((p) => p.outcome === 'win').length;
  const losses     = resolved.filter((p) => p.outcome === 'loss').length;
  const pushes     = resolved.filter((p) => p.outcome === 'push').length;
  const winRate    = resolved.length > 0 ? Math.round((wins / resolved.length) * 100) : null;
  const netElo     = user.globalElo - 1200;
  const biggestWin = resolved.reduce((max, p) => Math.max(max, p.eloDelta ?? 0), 0);

  const eloRank  = sportEloRank(user.globalElo);
  const nextTier = nextTierProgress(user.globalElo);
  const season   = getCurrentSeason();
  const daysLeft = season ? getDaysRemaining(season.end) : null;

  // Per-sport record, so a rating that hasn't moved is explained by "no picks
  // yet" rather than looking broken.
  function recordFor(members: Sport[]): { w: number; l: number; net: number; total: number } {
    const subset = resolved.filter((p: UserPick) => p.sport && members.includes(p.sport));
    return {
      w:     subset.filter((p) => p.outcome === 'win').length,
      l:     subset.filter((p) => p.outcome === 'loss').length,
      net:   subset.reduce((s, p) => s + (p.eloDelta ?? 0), 0),
      total: subset.length,
    };
  }

  const sports = SPORT_DISPLAY
    .map((s) => ({ ...s, elo: user.sportElos[s.key] ?? 1200, rec: recordFor(s.members) }))
    // Sports the user actually plays float to the top.
    .sort((a, b) => b.rec.total - a.rec.total || b.elo - a.elo);

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-[fadeIn_.2s_ease-out]"
      />

      <div
        style={sheetStyle}
        className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-card border-t border-x border-rim rounded-t-3xl max-h-[88dvh] flex flex-col animate-[sheetUp_.28s_cubic-bezier(0.32,0.72,0,1)]"
      >
        {/* Drag surface */}
        <div {...dragHandlers} className="pt-2.5 pb-2 shrink-0 cursor-grab active:cursor-grabbing touch-none">
          <div className="w-10 h-1 bg-rim rounded-full mx-auto" />
        </div>

        <div
          ref={scrollRef as React.Ref<HTMLDivElement>}
          className="overflow-y-auto overscroll-contain px-5 pt-2"
          style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
        >
          {/* Hero */}
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
              <p className="text-5xl font-black text-accent tabular-nums leading-none">
                {user.globalElo.toLocaleString()}
              </p>
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
              {winRate !== null && <p className="text-xs text-sub mt-0.5">{winRate}% win rate</p>}
            </div>
          </div>

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
            {sports.map(({ key, label, elo, rec }) => {
              const rank   = sportEloRank(elo);
              const played = rec.total > 0;
              return (
                <div
                  key={key}
                  className={`bg-layer rounded-xl px-3 py-2.5 ${played ? '' : 'opacity-55'}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-dim font-black uppercase tracking-widest">{label}</p>
                    <span className={`text-[9px] font-bold ${rank.color}`}>{rank.label}</span>
                  </div>
                  <p className="text-lg font-black text-ink tabular-nums leading-tight">{elo.toLocaleString()}</p>
                  {played ? (
                    <p className="text-[10px] text-dim tabular-nums">
                      {rec.w}W–{rec.l}L
                      <span className={`ml-1.5 font-bold ${rec.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {rec.net >= 0 ? '+' : ''}{rec.net}
                      </span>
                    </p>
                  ) : (
                    <p className="text-[10px] text-dim">No picks yet</p>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-[10px] text-dim text-center mt-4">
            Ratings update when your picks settle.
          </p>
        </div>
      </div>
    </div>
  );
}

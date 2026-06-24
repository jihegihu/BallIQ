'use client';

import { useState, useEffect } from 'react';
import { useUserStore } from '@/lib/userStore';
import Link from 'next/link';
import { UserPick } from '@/types';
import { calculateEloDelta, getKFactor, eventEloToProb } from '@/lib/elo';
import TournamentRecaps from '@/components/TournamentRecaps';

type Tab = 'pending' | 'results';

// ── Label builders ────────────────────────────────────────────────────────────

function buildPickLabel(pick: UserPick): string {
  const parts    = pick.matchDescription.split(' vs ');
  const homeTeam = parts[0] ?? 'Home';
  const awayTeam = parts[1] ?? 'Away';

  if (pick.betType === 'moneyline') {
    return `${pick.pickSide === 'home' ? homeTeam : awayTeam} to Win`;
  }
  if (pick.betType === 'over_under') {
    const line = pick.overUnderLine != null ? ` ${pick.overUnderLine}` : '';
    return pick.pickSide === 'over' ? `Over${line}` : `Under${line}`;
  }
  const team = pick.pickSide === 'home' ? homeTeam : awayTeam;
  if (pick.spreadLine != null) {
    const raw = pick.pickSide === 'home' ? pick.spreadLine : -pick.spreadLine;
    return `${team} ${raw > 0 ? '+' : ''}${raw}`;
  }
  return `${team} to Cover`;
}

function formatGameDate(commenceTime: string): string {
  try {
    const d        = new Date(commenceTime);
    const today    = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dayLabel =
      d.toDateString() === today.toDateString()    ? 'Today' :
      d.toDateString() === tomorrow.toDateString() ? 'Tomorrow' :
      d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    return `${dayLabel} · ${time}`;
  } catch { return commenceTime; }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type MatchScore = {
  id: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_team: string;
  away_team: string;
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PicksPage() {
  const [tab, setTab]                   = useState<Tab>('pending');
  const [matchScores, setMatchScores]   = useState<Record<string, MatchScore>>({});
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

  const user     = useUserStore((s) => s.user);
  const kFactor  = getKFactor(user.totalPicks, user.weeksActive);
  const allPicks = [...user.picks].reverse();

  const pending = allPicks.filter((p) => p.outcome === 'pending');
  const results = allPicks.filter((p) => p.outcome !== 'pending' && p.outcome !== 'cancelled' && p.outcome !== 'void');

  const cutoff48h    = Date.now() - 48 * 60 * 60 * 1000;
  const recentResults = results.filter((p) => new Date(p.placedAt).getTime() > cutoff48h);
  const olderResults  = results.filter((p) => new Date(p.placedAt).getTime() <= cutoff48h);

  const monthGroupMap = new Map<string, { key: string; label: string; picks: UserPick[] }>();
  for (const p of olderResults) {
    const d   = new Date(p.placedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!monthGroupMap.has(key)) monthGroupMap.set(key, { key, label, picks: [] });
    monthGroupMap.get(key)!.picks.push(p);
  }
  const monthGroups = [...monthGroupMap.values()];

  function toggleMonth(key: string) {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // Fetch live/final scores for pending picks
  useEffect(() => {
    const ids = pending.map((p) => p.matchId).filter(Boolean);
    if (!ids.length) return;
    fetch(`/api/match-scores?ids=${ids.join(',')}`)
      .then((r) => r.json())
      .then(({ matches }) => {
        const map: Record<string, MatchScore> = {};
        for (const m of (matches ?? [])) map[m.id] = m;
        setMatchScores(map);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.length]);

  // ── Compute analytics ────────────────────────────────────────────────────

  const wins       = results.filter((p) => p.outcome === 'win').length;
  const losses     = results.filter((p) => p.outcome === 'loss').length;
  const winRate    = results.length > 0 ? Math.round((wins / results.length) * 100) : null;
  const netElo     = results.reduce((sum, p) => sum + (p.eloDelta ?? 0), 0);
  const biggestWin = results.reduce((max, p) => Math.max(max, p.eloDelta ?? 0), 0);

  // By bet type
  const BET_TYPES = ['moneyline', 'spread', 'over_under'] as const;
  const byBetType = Object.fromEntries(
    BET_TYPES.map((bt) => {
      const sub  = results.filter((p) => p.betType === bt);
      const w    = sub.filter((p) => p.outcome === 'win').length;
      const elo  = sub.reduce((s, p) => s + (p.eloDelta ?? 0), 0);
      return [bt, { total: sub.length, wins: w, elo }];
    })
  ) as Record<string, { total: number; wins: number; elo: number }>;

  // By sport
  const sportMap = new Map<string, { w: number; total: number; elo: number }>();
  for (const p of results) {
    if (!p.sport) continue;
    const curr = sportMap.get(p.sport) ?? { w: 0, total: 0, elo: 0 };
    sportMap.set(p.sport, {
      w:     curr.w + (p.outcome === 'win' ? 1 : 0),
      total: curr.total + 1,
      elo:   curr.elo + (p.eloDelta ?? 0),
    });
  }
  const topSports = [...sportMap.entries()]
    .filter(([, v]) => v.total >= 1)
    .sort((a, b) => b[1].elo - a[1].elo)
    .slice(0, 4);

  // Last 10 win rate
  const last10      = results.slice(0, 10);
  const last10Wins  = last10.filter((p) => p.outcome === 'win').length;
  const last10Rate  = last10.length > 0 ? Math.round((last10Wins / last10.length) * 100) : null;

  const BET_LABEL: Record<string, string> = {
    moneyline:  'Moneyline',
    spread:     'Spread',
    over_under: 'Over/Under',
  };

  return (
    <main className="min-h-screen pb-24 max-w-md mx-auto px-4 pt-4">
      <h1 className="text-2xl font-black text-ink mb-4">My Picks</h1>

      {/* ── Top stats ──────────────────────────────────────────────────────── */}
      {results.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-card border border-rim rounded-xl p-3">
              <p className="text-[10px] text-dim uppercase tracking-wide mb-1">Record</p>
              <p className="text-lg font-black">
                <span className="text-emerald-400">{wins}W</span>
                <span className="text-dim mx-1">–</span>
                <span className="text-red-400">{losses}L</span>
              </p>
              {winRate !== null && (
                <p className="text-[10px] text-dim mt-0.5">{winRate}% overall</p>
              )}
            </div>

            <div className="bg-card border border-rim rounded-xl p-3">
              <p className="text-[10px] text-dim uppercase tracking-wide mb-1">Net Elo</p>
              <p className={`text-lg font-black ${netElo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {netElo >= 0 ? '+' : ''}{netElo}
              </p>
              <p className="text-[10px] text-dim mt-0.5">{results.length} settled picks</p>
            </div>

            <div className="bg-card border border-rim rounded-xl p-3">
              <p className="text-[10px] text-dim uppercase tracking-wide mb-1">🏆 Best Pick</p>
              <p className="text-lg font-black text-emerald-400">
                {biggestWin > 0 ? `+${biggestWin} Elo` : '—'}
              </p>
            </div>

            <div className="bg-card border border-rim rounded-xl p-3">
              <p className="text-[10px] text-dim uppercase tracking-wide mb-1">Last 10</p>
              {last10Rate !== null
                ? <p className={`text-lg font-black ${last10Rate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{last10Rate}%</p>
                : <p className="text-lg font-black text-dim">—</p>
              }
              <p className="text-[10px] text-dim mt-0.5">{last10Wins}/{last10.length} wins</p>
            </div>
          </div>

          {/* ── By Bet Type ──────────────────────────────────────────────── */}
          <div className="bg-card border border-rim rounded-xl p-3 mb-3">
            <p className="text-[10px] text-dim uppercase tracking-widest font-bold mb-2">By Pick Type</p>
            <div className="space-y-2">
              {BET_TYPES.filter((bt) => byBetType[bt].total > 0).map((bt) => {
                const { total, wins: w, elo } = byBetType[bt];
                const rate = Math.round((w / total) * 100);
                return (
                  <div key={bt} className="flex items-center gap-2">
                    <p className="text-xs font-bold text-sub w-24 shrink-0">{BET_LABEL[bt]}</p>
                    <div className="flex-1 h-1.5 bg-layer rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent/60"
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-dim w-8 text-right">{rate}%</p>
                    <p className={`text-[10px] font-bold w-12 text-right tabular-nums ${elo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {elo >= 0 ? '+' : ''}{elo}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── By Sport ─────────────────────────────────────────────────── */}
          {topSports.length > 0 && (
            <div className="bg-card border border-rim rounded-xl p-3 mb-5">
              <p className="text-[10px] text-dim uppercase tracking-widest font-bold mb-2">By Sport</p>
              <div className="grid grid-cols-2 gap-2">
                {topSports.map(([sport, { w, total, elo }]) => {
                  const rate = Math.round((w / total) * 100);
                  return (
                    <div key={sport} className="bg-layer rounded-lg px-2.5 py-2">
                      <p className="text-[10px] text-dim font-black uppercase tracking-widest">{sport}</p>
                      <p className="text-sm font-black text-ink">{w}–{total - w}</p>
                      <p className="text-[9px] text-dim">{rate}% · <span className={elo >= 0 ? 'text-emerald-400' : 'text-red-400'}>{elo >= 0 ? '+' : ''}{elo} Elo</span></p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Tournament recaps (shown whenever the user has tournament picks) ──── */}
      <TournamentRecaps picks={user.picks} />

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-5">
        {([['pending', `Pending${pending.length > 0 ? ` (${pending.length})` : ''}`], ['results', 'Results']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition ${
              tab === key
                ? 'bg-violet-600 text-white'
                : 'bg-card text-dim border border-rim hover:border-sub'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      {tab === 'pending' && (
        pending.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🎯</p>
            <p className="font-bold text-ink mb-1">No pending picks</p>
            <p className="text-sm text-dim mb-5">Head to the home screen to make picks.</p>
            <Link
              href="/"
              className="inline-block text-white font-black px-5 py-2.5 rounded-xl text-sm"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #A78BFA)' }}
            >
              Pick Games →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((p) => (
              <PendingCard key={p.id} pick={p} kFactor={kFactor} matchScore={matchScores[p.matchId]} />
            ))}
          </div>
        )
      )}

      {tab === 'results' && (
        results.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📊</p>
            <p className="font-bold text-ink mb-1">No results yet</p>
            <p className="text-sm text-dim">Your settled picks will appear here.</p>
          </div>
        ) : (
          <div>
            {/* Recent 48h — shown flat */}
            {recentResults.length > 0 && (
              <>
                {monthGroups.length > 0 && (
                  <p className="text-[10px] font-black text-dim uppercase tracking-widest mb-2 px-1">Recent</p>
                )}
                <div className="flex flex-col gap-2 mb-4">
                  {recentResults.map((p) => <ResultCard key={p.id} pick={p} />)}
                </div>
              </>
            )}

            {/* Older picks — collapsed by month */}
            {monthGroups.map(({ key, label, picks }) => {
              const collapsed = collapsedMonths.has(key);
              const w   = picks.filter((p) => p.outcome === 'win').length;
              const l   = picks.filter((p) => p.outcome === 'loss').length;
              const elo = picks.reduce((s, p) => s + (p.eloDelta ?? 0), 0);
              return (
                <div key={key} className="mb-1">
                  <button
                    onClick={() => toggleMonth(key)}
                    className="w-full flex items-center justify-between py-2 px-1 border-b border-rim"
                  >
                    <span className="text-[11px] font-black text-sub uppercase tracking-widest">{label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-emerald-400">{w}W</span>
                      <span className="text-dim text-[10px]">–</span>
                      <span className="text-[10px] font-bold text-red-400">{l}L</span>
                      <span className={`text-[10px] font-bold ml-1.5 tabular-nums ${elo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {elo >= 0 ? '+' : ''}{elo} Elo
                      </span>
                      <span className="text-dim text-sm ml-1">{collapsed ? '›' : '⌄'}</span>
                    </div>
                  </button>
                  {!collapsed && (
                    <div className="flex flex-col gap-2 pt-2 mb-3">
                      {picks.map((p) => <ResultCard key={p.id} pick={p} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </main>
  );
}

// ── Pending card ──────────────────────────────────────────────────────────────

function PendingCard({ pick, kFactor, matchScore }: { pick: UserPick; kFactor: number; matchScore?: MatchScore }) {
  const label      = buildPickLabel(pick);
  const placedDate = new Date(pick.placedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const recalc = calculateEloDelta({
    userElo: pick.userEloAtPick, eventElo: pick.eventElo, kFactor,
    confidenceLevel: pick.confidenceLevel, betType: pick.betType, outcome: 'win',
  });

  // Market-implied win probability for this pick
  const marketProb = Math.round(eventEloToProb(pick.eventElo) * 100);

  // Live score
  const hasScore  = matchScore && matchScore.home_score != null && matchScore.away_score != null;
  const isLive    = matchScore?.status === 'live';
  const isFinal   = matchScore?.status === 'completed';

  return (
    <div className="bg-card border border-accent/20 rounded-xl p-3">
      <div className="flex justify-between items-start mb-1.5">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-ink text-xs truncate">{pick.matchDescription}</p>
          <p className="text-[10px] text-dim mt-0.5">
            {pick.sport && <span className="text-accent/80 font-bold">{pick.sport} · </span>}
            Placed {placedDate}
          </p>
        </div>
        <span className="ml-2 text-[9px] font-black border px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 bg-accent/10 text-accent border-accent/30">
          PENDING
        </span>
      </div>

      <div className="bg-layer rounded-lg px-2.5 py-2 mb-1.5">
        <p className="text-[9px] text-dim uppercase tracking-widest font-semibold mb-0.5">Your Pick</p>
        <p className="font-black text-ink text-xs">{label}</p>
      </div>

      {/* Live score ticker */}
      {hasScore ? (
        <div className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 mb-1.5 ${
          isLive ? 'bg-emerald-500/10 border border-emerald-500/20' :
          isFinal ? 'bg-layer' : 'bg-layer'
        }`}>
          <div className="text-[10px]">
            {isLive && <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mr-2">● Live</span>}
            {isFinal && <span className="text-[8px] font-black text-dim uppercase tracking-widest mr-2">Final</span>}
            <span className="font-black text-ink">
              {matchScore.home_team?.split(' ').pop()} {matchScore.home_score}
              <span className="text-dim mx-1">–</span>
              {matchScore.away_score} {matchScore.away_team?.split(' ').pop()}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 bg-layer rounded-lg px-2.5 py-1.5 mb-1.5">
          <span className="text-[9px] text-dim uppercase tracking-widest font-semibold">Tip-off</span>
          <span className="text-[10px] font-bold text-ink ml-auto">
            {pick.gameTime ? formatGameDate(pick.gameTime) : `Placed ${placedDate}`}
          </span>
        </div>
      )}

      {/* Win probability + Elo projection */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex-1">
          <div className="flex justify-between text-[8px] text-dim mb-0.5">
            <span>Market win prob</span>
            <span className="font-bold text-sub">{marketProb}%</span>
          </div>
          <div className="h-1 bg-layer rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-accent/50" style={{ width: `${marketProb}%` }} />
          </div>
        </div>
      </div>

      <div className="flex items-center text-[10px]">
        <span className="text-dim">
          <span className="text-emerald-400">+{recalc.projectedGain}</span>
          <span className="mx-1">/</span>
          <span className="text-red-400">-{recalc.projectedLoss}</span>
          <span className="ml-1 text-dim">Elo</span>
        </span>
        <span className="ml-auto font-semibold text-violet-400">+{pick.xpEarned} XP</span>
      </div>
    </div>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────

const RESULT_CFG = {
  win:  { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', badge: 'WON',  badgeCls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: '✓', iconCls: 'text-emerald-400', labelCls: 'text-emerald-300', eloCls: 'text-emerald-400' },
  loss: { border: 'border-red-500/30',     bg: 'bg-red-500/10',     badge: 'LOST', badgeCls: 'bg-red-500/10 text-red-400 border-red-500/30',             icon: '✗', iconCls: 'text-red-400',     labelCls: 'text-red-300',     eloCls: 'text-red-400'     },
  push: { border: 'border-rim',            bg: 'bg-layer',          badge: 'PUSH', badgeCls: 'bg-layer text-sub border-rim',                             icon: '—', iconCls: 'text-sub',         labelCls: 'text-sub',         eloCls: 'text-sub'         },
} as const;

function ResultCard({ pick }: { pick: UserPick }) {
  const outcome    = pick.outcome === 'push' ? 'push' : pick.outcome === 'win' ? 'win' : 'loss';
  const cfg        = RESULT_CFG[outcome];
  const label      = buildPickLabel(pick);
  const placedDate = new Date(pick.placedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const marketProb = Math.round(eventEloToProb(pick.eventElo) * 100);

  return (
    <div className={`bg-card border ${cfg.border} rounded-xl p-3`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-ink text-xs truncate">{pick.matchDescription}</p>
          <p className="text-[10px] text-dim mt-0.5">
            {pick.sport && <span className="text-accent/80 font-bold">{pick.sport} · </span>}
            {placedDate}
          </p>
        </div>
        <span className={`ml-2 text-[9px] font-black border px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${cfg.badgeCls}`}>
          {cfg.badge}
        </span>
      </div>

      <div className={`${cfg.bg} rounded-lg px-2.5 py-2 mb-2 flex items-center gap-2`}>
        <span className={`font-black text-xs ${cfg.iconCls}`}>{cfg.icon}</span>
        <p className={`font-black text-xs leading-tight ${cfg.labelCls}`}>{label}</p>
        <span className="ml-auto text-[8px] text-dim">{marketProb}% odds</span>
      </div>

      <div className="flex items-center text-[10px]">
        {pick.eloDelta !== null && (
          <span className={`font-bold ${cfg.eloCls}`}>
            {pick.eloDelta >= 0 ? '▲' : '▼'} {Math.abs(pick.eloDelta)} Elo
          </span>
        )}
        <span className="ml-auto font-semibold text-violet-400">+{pick.xpEarned} XP</span>
      </div>
    </div>
  );
}

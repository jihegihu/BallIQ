'use client';

import { useState, useEffect } from 'react';
import TeamAvatar from '@/components/TeamAvatar';
import { useUserStore } from '@/lib/userStore';
import Link from 'next/link';
import { UserPick } from '@/types';
import { calculateEloDelta, getKFactor } from '@/lib/elo';
import TournamentRecaps from '@/components/TournamentRecaps';
import { summarizeRecord } from '@/lib/record';
import { PICK_LABEL } from '@/lib/pickLabels';

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
  const [statsOpen, setStatsOpen]       = useState(false);

  const user     = useUserStore((s) => s.user);
  const hydrated = useUserStore((s) => s.hydrated);
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

  const { wins, losses, winRate } = summarizeRecord(results.map((p) => p.outcome));
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

  const BET_LABEL = PICK_LABEL;

  // Picks live in the store, so there's no server suspense boundary to hang a
  // loading.tsx off — show the skeleton until the first hydrate lands.
  if (!hydrated) {
    return (
      <main className="min-h-screen pb-28 max-w-md mx-auto px-4 pt-4">
        <div className="skeleton h-7 w-32 rounded mb-4" />
        <div className="skeleton h-12 w-full rounded-xl mb-4" />
        <div className="flex gap-2 mb-5">
          <div className="skeleton h-9 flex-1 rounded-xl" />
          <div className="skeleton h-9 flex-1 rounded-xl" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-32 w-full rounded-xl" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-28 max-w-md mx-auto px-4 pt-4">
      <h1 className="text-2xl font-black text-ink mb-4">My Picks</h1>

      {/* ── Stats ──────────────────────────────────────────────────────────
          Collapsed to a single summary strip by default. The picks themselves
          are what people open this page for; the full breakdown is one tap
          away rather than three screens of scrolling in front of them. */}
      {results.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setStatsOpen((v) => !v)}
            className="w-full bg-card border border-rim rounded-xl px-3 py-2.5 flex items-center justify-between active:scale-[0.99] transition"
          >
            <div className="flex items-center gap-3 text-sm font-black tabular-nums">
              <span>
                <span className="text-emerald-400">{wins}W</span>
                <span className="text-dim mx-0.5">–</span>
                <span className="text-red-400">{losses}L</span>
              </span>
              {winRate !== null && <span className="text-sub text-xs font-bold">{winRate}%</span>}
              <span className={netElo >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {netElo >= 0 ? '+' : ''}{netElo} Elo
              </span>
            </div>
            <span className="flex items-center gap-1 text-[10px] font-bold text-dim uppercase tracking-widest">
              Stats <span className="text-sm leading-none">{statsOpen ? '⌄' : '›'}</span>
            </span>
          </button>

          {statsOpen && (
            <div className="mt-2">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="bg-card border border-rim rounded-xl p-2.5">
                  <p className="text-[10px] text-dim uppercase tracking-wide mb-0.5">🏆 Best Pick</p>
                  <p className="text-base font-black text-emerald-400">
                    {biggestWin > 0 ? `+${biggestWin} Elo` : '—'}
                  </p>
                </div>
                <div className="bg-card border border-rim rounded-xl p-2.5">
                  <p className="text-[10px] text-dim uppercase tracking-wide mb-0.5">Last 10</p>
                  {last10Rate !== null
                    ? <p className={`text-base font-black ${last10Rate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {last10Rate}% <span className="text-[10px] text-dim font-bold">{last10Wins}/{last10.length}</span>
                      </p>
                    : <p className="text-base font-black text-dim">—</p>
                  }
                </div>
              </div>

              <div className="bg-card border border-rim rounded-xl p-3 mb-2">
                <p className="text-[10px] text-dim uppercase tracking-widest font-bold mb-2">By Pick Type</p>
                <div className="space-y-2">
                  {BET_TYPES.filter((bt) => byBetType[bt].total > 0).map((bt) => {
                    const { total, wins: w, elo } = byBetType[bt];
                    const rate = Math.round((w / total) * 100);
                    return (
                      <div key={bt} className="flex items-center gap-2">
                        <p className="text-xs font-bold text-sub w-24 shrink-0">{BET_LABEL[bt]}</p>
                        <div className="flex-1 h-1.5 bg-layer rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-accent/60" style={{ width: `${rate}%` }} />
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

              {topSports.length > 0 && (
                <div className="bg-card border border-rim rounded-xl p-3">
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

              {/* Tournament recaps live inside the dropdown too — they're
                  retrospective stats, not something to scroll past on the way
                  to your live picks. */}
              <div className="mt-2">
                <TournamentRecaps picks={user.picks} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* With no settled picks there's no stats dropdown to tuck these into,
          but tournament picks still in flight are worth surfacing. Renders
          nothing when the user has no tournament picks at all. */}
      {results.length === 0 && <TournamentRecaps picks={user.picks} />}

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
// Deliberately two lines, no labelled sub-boxes.
//
// The old card stacked eight facts inside four bordered boxes with uppercase
// micro-labels ("YOUR PICK", "TIP-OFF", "MARKET WIN PROB", a "PENDING" badge).
// How DraftKings' My Bets, Underdog's entries and Sleeper's matchup rows all
// handle this: the context supplies the labels, so they print the data and
// nothing else. "PENDING" on the Pending tab and "YOUR PICK" on My Picks are
// both saying what the user already knows, and the probability bar was noise
// next to the number that actually matters — the Elo at stake.

/** The team a pick is really about, for the avatar. */
function pickTeam(pick: UserPick): string {
  const [home = '', away = ''] = pick.matchDescription.split(' vs ');
  if (pick.pickSide === 'away') return away;
  return home;   // home, over and under all identify with the game itself
}

function PendingCard({ pick, kFactor, matchScore }: { pick: UserPick; kFactor: number; matchScore?: MatchScore }) {
  const label = buildPickLabel(pick);

  const recalc = calculateEloDelta({
    userElo: pick.userEloAtPick, eventElo: pick.eventElo, kFactor,
    confidenceLevel: pick.confidenceLevel, betType: pick.betType, outcome: 'win',
  });

  const hasScore = matchScore && matchScore.home_score != null && matchScore.away_score != null;
  const isLive   = matchScore?.status === 'live';
  const isFinal  = matchScore?.status === 'completed';

  return (
    <div className={`bg-card border rounded-xl px-3 py-2.5 flex items-center gap-3 ${
      isLive ? 'border-emerald-500/30' : 'border-rim'
    }`}>
      <TeamAvatar teamName={pickTeam(pick)} size="xs" />

      <div className="flex-1 min-w-0">
        <p className="font-black text-ink text-sm leading-tight truncate">{label}</p>

        {/* One status line: the score once there is one, otherwise kick-off. */}
        {hasScore ? (
          <p className="text-xs mt-0.5 truncate">
            {isLive && (
              <span className="font-black text-emerald-400 mr-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 align-middle" />
                LIVE
              </span>
            )}
            {isFinal && <span className="font-bold text-dim mr-1.5">Final</span>}
            <span className="font-bold text-sub tabular-nums">
              {matchScore!.home_team?.split(' ').pop()} {matchScore!.home_score}
              <span className="text-dim mx-1">–</span>
              {matchScore!.away_score} {matchScore!.away_team?.split(' ').pop()}
            </span>
          </p>
        ) : (
          <p className="text-xs text-dim mt-0.5 truncate">
            {pick.sport && <span className="font-bold text-accent/80">{pick.sport}</span>}
            {pick.sport && pick.gameTime && <span className="mx-1">·</span>}
            {pick.gameTime && formatGameDate(pick.gameTime)}
          </p>
        )}
      </div>

      {/* The one number that matters, with the downside underneath it. */}
      <div className="text-right shrink-0">
        <p className="text-base font-black text-emerald-400 tabular-nums leading-none">
          +{recalc.projectedGain}
        </p>
        <p className="text-xs text-dim tabular-nums mt-0.5">−{recalc.projectedLoss}</p>
      </div>
    </div>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────
// Same two-line shape as the pending card. What earns its place here is the
// outcome colour and the rating delta; the "WON"/"LOST" pill was saying what
// the green/red already says, and "% odds" was detail nobody reviews a settled
// pick for.

const RESULT_CFG = {
  win:  { border: 'border-emerald-500/30', tone: 'text-emerald-400', mark: '✓' },
  loss: { border: 'border-red-500/25',     tone: 'text-red-400',     mark: '✗' },
  push: { border: 'border-rim',            tone: 'text-sub',         mark: '—' },
} as const;

function ResultCard({ pick }: { pick: UserPick }) {
  const outcome = pick.outcome === 'push' ? 'push' : pick.outcome === 'win' ? 'win' : 'loss';
  const cfg     = RESULT_CFG[outcome];
  const label   = buildPickLabel(pick);
  const settled = new Date(pick.resolvedAt ?? pick.placedAt)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className={`bg-card border ${cfg.border} rounded-xl px-3 py-2.5`}>
      <div className="flex items-center gap-3">
        <TeamAvatar teamName={pickTeam(pick)} size="xs" />

        <div className="flex-1 min-w-0">
          <p className="font-black text-ink text-sm leading-tight truncate">
            <span className={`${cfg.tone} mr-1.5`}>{cfg.mark}</span>
            {label}
          </p>
          <p className="text-xs text-dim mt-0.5 truncate">
            {pick.sport && <span className="font-bold text-accent/80">{pick.sport}</span>}
            {pick.sport && <span className="mx-1">·</span>}
            {settled}
          </p>
        </div>

        {pick.eloDelta !== null && (
          <p className={`text-base font-black tabular-nums shrink-0 ${cfg.tone}`}>
            {pick.eloDelta > 0 ? '+' : pick.eloDelta < 0 ? '−' : ''}{Math.abs(pick.eloDelta)}
          </p>
        )}
      </div>

      {/* A push returns ±0 Elo. Without saying so, a zero delta just reads as
          a bug. */}
      {outcome === 'push' && (
        <p className="text-xs text-dim mt-1.5 leading-snug">
          {pick.betType === 'over_under'
            ? 'The total landed exactly on the line'
            : 'The result landed exactly on the line'}
          {' '}— your rating is unchanged.
        </p>
      )}
    </div>
  );
}

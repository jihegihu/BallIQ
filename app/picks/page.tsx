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
import { StatTile, BreakdownRow } from '@/components/StatPieces';
import EloSparkline from '@/components/EloSparkline';

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
  // 'void' stays IN this list. A pick that could not be settled used to be
  // filtered out here, so it vanished from Results with no explanation — the
  // single most alarming thing the app can do with someone's pick. It is
  // excluded from the win-rate maths (see lib/record.ts) but still shown.
  const results = allPicks.filter((p) => p.outcome !== 'pending' && p.outcome !== 'cancelled');

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
  // Every breakdown goes through summarizeRecord, same as the banner above.
  // These used to count `total` as every row and render `w–(total-w)`, which
  // silently booked each push and each void as a LOSS — so "by pick type"
  // disagreed with the headline record and with what you can read off your
  // own results list.
  const byBetType = Object.fromEntries(
    BET_TYPES.map((bt) => {
      const sub = results.filter((p) => p.betType === bt);
      return [bt, {
        ...summarizeRecord(sub.map((p) => p.outcome)),
        elo: sub.reduce((s, p) => s + (p.eloDelta ?? 0), 0),
      }];
    })
  ) as Record<string, ReturnType<typeof summarizeRecord> & { elo: number }>;

  // By sport
  const sportBuckets = new Map<string, UserPick[]>();
  for (const p of results) {
    if (!p.sport) continue;
    const list = sportBuckets.get(p.sport) ?? [];
    list.push(p);
    sportBuckets.set(p.sport, list);
  }
  const topSports = [...sportBuckets.entries()]
    .map(([sport, list]) => [sport, {
      ...summarizeRecord(list.map((p) => p.outcome)),
      elo: list.reduce((s, p) => s + (p.eloDelta ?? 0), 0),
    }] as const)
    .filter(([, v]) => v.settled > 0)
    .sort((a, b) => b[1].elo - a[1].elo)
    .slice(0, 4);

  // Last 10 — the last ten picks that actually went one way or the other.
  // Including pushes and voids made "7/10" mean something different here than
  // it did anywhere else on the page.
  const last10Rec   = summarizeRecord(
    results.filter((p) => p.outcome === 'win' || p.outcome === 'loss').slice(0, 10).map((p) => p.outcome),
  );
  const last10Wins  = last10Rec.wins;
  const last10Count = last10Rec.decided;
  const last10Rate  = last10Rec.winRate;

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
                <span className="text-good">{wins}W</span>
                <span className="text-dim mx-0.5">–</span>
                <span className="text-bad">{losses}L</span>
              </span>
              {winRate !== null && <span className="text-sub text-xs font-bold">{winRate}%</span>}
              <span className={netElo >= 0 ? 'text-good' : 'text-bad'}>
                {netElo >= 0 ? '+' : ''}{netElo} Elo
              </span>
            </div>
            <span className="flex items-center gap-1 text-[10px] font-bold text-dim uppercase tracking-widest">
              Stats <span className="text-sm leading-none">{statsOpen ? '⌄' : '›'}</span>
            </span>
          </button>

          {statsOpen && (
            <div className="mt-2 flex flex-col gap-2">
              {/* Headline figures. Three uniform tiles — these are numbers,
                  not charts, so they get no plot. */}
              <div className="grid grid-cols-3 gap-2">
                <StatTile
                  label="Best"
                  value={biggestWin > 0 ? `+${biggestWin}` : '—'}
                  sub={biggestWin > 0 ? 'Elo' : undefined}
                  tone={biggestWin > 0 ? 'good' : 'neutral'}
                />
                <StatTile
                  label="Last 10"
                  value={last10Rate !== null ? `${last10Rate}%` : '—'}
                  sub={last10Rate !== null ? `${last10Wins}/${last10Count}` : undefined}
                  tone={last10Rate === null ? 'neutral' : last10Rate >= 50 ? 'good' : 'bad'}
                />
                <StatTile
                  label="Streak"
                  value={user.currentStreak > 0 ? `${user.currentStreak}` : '—'}
                  sub={user.currentStreak > 0 ? 'days' : undefined}
                />
              </div>

              {/* Rating trend — change over time, so this one IS a chart. */}
              <EloSparkline days={30} />

              {/* Both breakdowns share one row component: same data job, so
                  the same form. By Sport used to be nested cards instead. */}
              <div className="bg-card border border-rim rounded-xl px-3 py-2.5">
                <p className="text-xs text-dim uppercase tracking-widest font-bold mb-1">By pick type</p>
                {BET_TYPES.filter((bt) => byBetType[bt].settled > 0).map((bt) => {
                  const { wins, losses, pushes, winRate, elo } = byBetType[bt];
                  return (
                    <BreakdownRow
                      key={bt}
                      name={BET_LABEL[bt]}
                      record={pushes > 0 ? `${wins}–${losses}–${pushes}` : `${wins}–${losses}`}
                      rate={winRate ?? 0}
                      net={elo}
                    />
                  );
                })}
              </div>

              {topSports.length > 0 && (
                <div className="bg-card border border-rim rounded-xl px-3 py-2.5">
                  <p className="text-xs text-dim uppercase tracking-widest font-bold mb-1">By sport</p>
                  {topSports.map(([sport, { wins, losses, pushes, winRate, elo }]) => (
                    <BreakdownRow
                      key={sport}
                      name={sport}
                      record={pushes > 0 ? `${wins}–${losses}–${pushes}` : `${wins}–${losses}`}
                      rate={winRate ?? 0}
                      net={elo}
                    />
                  ))}
                </div>
              )}

              {/* Retrospective, so it belongs behind the same disclosure as
                  the rest of the stats rather than above the live picks. */}
              <TournamentRecaps picks={user.picks} />
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
                      <span className="text-[10px] font-bold text-good">{w}W</span>
                      <span className="text-dim text-[10px]">–</span>
                      <span className="text-[10px] font-bold text-bad">{l}L</span>
                      <span className={`text-[10px] font-bold ml-1.5 tabular-nums ${elo >= 0 ? 'text-good' : 'text-bad'}`}>
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
              <span className="font-black text-good mr-1.5">
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
        <p className="text-base font-black text-good tabular-nums leading-none">
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
  win:  { border: 'border-emerald-500/30', tone: 'text-good', mark: '✓' },
  loss: { border: 'border-red-500/25',     tone: 'text-bad',  mark: '✗' },
  push: { border: 'border-rim',            tone: 'text-sub',  mark: '—' },
  // Never graded — the final score could not be retrieved in time.
  void: { border: 'border-rim',            tone: 'text-dim',  mark: '⊘' },
} as const;

function ResultCard({ pick }: { pick: UserPick }) {
  const outcome =
    pick.outcome === 'push' ? 'push' :
    pick.outcome === 'void' ? 'void' :
    pick.outcome === 'win'  ? 'win'  : 'loss';
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

      {/* A void pick is one the system never managed to grade. Saying so
          plainly beats letting it look like a loss or vanish entirely. */}
      {outcome === 'void' && (
        <p className="text-xs text-dim mt-1.5 leading-snug">
          Couldn&rsquo;t be settled — the final score wasn&rsquo;t available in time.
          Your rating is unchanged and this pick doesn&rsquo;t count toward your record.
        </p>
      )}

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

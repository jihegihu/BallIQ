'use client';

import { useState, useEffect } from 'react';
import TeamAvatar from '@/components/TeamAvatar';
import { useUserStore } from '@/lib/userStore';
import Link from 'next/link';
import { UserPick } from '@/types';
import { calculateEloDelta, getKFactor } from '@/lib/elo';
import TournamentRecaps from '@/components/TournamentRecaps';
import StatsPanel from '@/components/StatsPanel';
import { useTourStore } from '@/lib/tourStore';
import { ExampleResultsLabel, EXAMPLE_RESULTS } from '@/components/TourExamples';
import Icon from '@/components/Icon';

type Tab = 'pending' | 'results' | 'stats';

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
  // /picks?tab=stats opens on Stats (the Account page links there). Read once
  // on the client; nothing below renders until the account has loaded, so the
  // server and the client never disagree about which tab is showing.
  const [tabState, setTab]              = useState<Tab>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'stats'
      ? 'stats' : 'pending');

  // The walkthrough shows Pending, then Results. Derived, not copied into
  // state, so the tab is the user's own again the moment it ends.
  const tourActive = useTourStore((s) => s.active);
  const tourStep   = useTourStore((s) => s.step);
  const tab: Tab =
    tourActive && tourStep === 'pending' ? 'pending' :
    tourActive && tourStep === 'results' ? 'results' : tabState;
  const [matchScores, setMatchScores]   = useState<Record<string, MatchScore>>({});
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

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

  // A new account has nothing settled, so the results stop would be an empty
  // state. Show labelled examples there instead, only until real ones exist.
  const showExamples = tourActive && tourStep === 'results' && results.length === 0;

  return (
    <main className="min-h-screen pb-28 max-w-md mx-auto px-4 pt-4">
      <h1 className="text-2xl font-black text-ink mb-4">My Picks</h1>

      {/* Before anything has settled the Stats tab is empty, so tournament
          picks still in flight are surfaced here instead. Renders nothing
          when the user has no tournament picks at all. */}
      {results.length === 0 && tab !== 'stats' && <TournamentRecaps picks={user.picks} />}

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-5">
        {([['pending', `Pending${pending.length > 0 ? ` (${pending.length})` : ''}`], ['results', 'Results'], ['stats', 'Stats']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`tap flex-1 py-2 rounded-xl text-xs font-black transition ${
              tab === key
                ? 'bg-primary text-white'
                : 'bg-card text-dim border border-rim hover:border-sub'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'stats' && <StatsPanel results={results} allPicks={user.picks} />}

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      {tab === 'pending' && (
        pending.length === 0 ? (
          <div className="text-center py-16">
            <Icon name="target" size={40} strokeWidth={1.25} className="mx-auto mb-3 text-dim" />
            <p className="font-bold text-ink mb-1">No pending picks</p>
            <p className="text-sm text-dim mb-5">Head to the home screen to make picks.</p>
            <Link
              href="/"
              className="tap inline-block bg-primary text-white font-black px-5 py-2.5 rounded-xl text-sm active:scale-[0.98] transition-transform"
            >
              Pick Games <Icon name="arrowRight" size={15} className="ml-1" />
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

      {tab === 'results' && showExamples && (
        <div>
          <ExampleResultsLabel />
          <div className="flex flex-col gap-2">
            {EXAMPLE_RESULTS.map((p) => <ResultCard key={p.id} pick={p} />)}
          </div>
        </div>
      )}

      {tab === 'results' && !showExamples && (
        results.length === 0 ? (
          <div className="text-center py-16">
            <Icon name="barChart" size={40} strokeWidth={1.25} className="mx-auto mb-3 text-dim" />
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
                    className="tap w-full flex items-center justify-between py-2 px-1 border-b border-rim"
                  >
                    <span className="text-[11px] font-black text-sub uppercase tracking-widest">{label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-good">{w}W</span>
                      <span className="text-dim text-[10px]">–</span>
                      <span className="text-[10px] font-bold text-bad">{l}L</span>
                      <span className={`text-[10px] font-bold ml-1.5 tabular-nums ${elo >= 0 ? 'text-good' : 'text-bad'}`}>
                        {elo >= 0 ? '+' : ''}{elo} Elo
                      </span>
                      <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={14} className="text-dim ml-1" />
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

/** "Boston Celtics" -> "Celtics". Keeps the subtitle short enough to fit. */
function shortTeam(team: string): string {
  const parts = team.trim().split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : team;
}

/**
 * The fixture, phrased for whichever pick type it is.
 *
 * Without this a pick read "76ers to Win" with no hint of who they were
 * playing — fine on the board where the card shows both teams, useless on a
 * list of picks made days ago. Totals get the full matchup since the pick is
 * about the game rather than a side.
 */
function matchupLabel(pick: UserPick): string {
  const [home = '', away = ''] = pick.matchDescription.split(' vs ');
  if (!home || !away) return '';
  if (pick.betType === 'over_under') return `${shortTeam(away)} vs ${shortTeam(home)}`;
  return `vs ${shortTeam(pick.pickSide === 'away' ? home : away)}`;
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
    <div className={`bg-card border rounded-2xl px-3 py-2.5 flex items-center gap-3 ${
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
            {pick.sport && <span className="mx-1">·</span>}
            {matchupLabel(pick)}
            {pick.gameTime && <span className="mx-1">·</span>}
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
  win:  { border: 'border-emerald-500/30', tone: 'text-good', mark: 'check' },
  loss: { border: 'border-red-500/25',     tone: 'text-bad',  mark: 'close' },
  push: { border: 'border-rim',            tone: 'text-sub',  mark: 'minus' },
  // Never graded — the final score could not be retrieved in time.
  void: { border: 'border-rim',            tone: 'text-dim',  mark: 'ban' },
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
    <div className={`bg-card border ${cfg.border} rounded-2xl px-3 py-2.5`}>
      <div className="flex items-center gap-3">
        <TeamAvatar teamName={pickTeam(pick)} size="xs" />

        <div className="flex-1 min-w-0">
          <p className="font-black text-ink text-sm leading-tight truncate">
            <Icon name={cfg.mark} size={14} className={`${cfg.tone} mr-1.5 -mt-0.5`} />
            {label}
          </p>
          <p className="text-xs text-dim mt-0.5 truncate">
            {pick.sport && <span className="font-bold text-accent/80">{pick.sport}</span>}
            {pick.sport && <span className="mx-1">·</span>}
            {matchupLabel(pick)}
            <span className="mx-1">·</span>
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

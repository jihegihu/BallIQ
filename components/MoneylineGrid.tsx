'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useUserStore } from '@/lib/userStore';
import { calculatePickXP } from '@/lib/userStore';
import { calculateEloDelta, getKFactor } from '@/lib/elo';
import { hapticImpact } from '@/lib/haptics';
import { useLongPress } from '@/lib/useLongPress';
import HoldToPick from '@/components/HoldToPick';
import { Match, Sport, UserPick } from '@/types';
import TeamAvatar from '@/components/TeamAvatar';
import RecapBanner from '@/components/RecapBanner';
import PendingPicksBar from '@/components/PendingPicksBar';
import BetSheet from '@/components/BetSheet';
import LiveStrip from '@/components/LiveStrip';

// Hook-per-card wrapper (hooks can't be called inside .map). Long-pressing
// the card chrome opens the full BetSheet with a haptic thump.
//
// The bet buttons inside run their own 3-second hold-to-confirm, so presses
// that start on one must NOT also arm the card's sheet gesture — HoldToPick
// stops propagation, and this guard is the belt to that braces.
function LongPressCard({ onLongPress, children }: { onLongPress: () => void; children: React.ReactNode }) {
  const handlers = useLongPress(() => { hapticImpact('medium'); onLongPress(); });

  return (
    <div
      {...handlers}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('[data-bet-button]')) return;
        handlers.onPointerDown(e);
      }}
      className="bg-card border border-rim rounded-2xl overflow-hidden select-none"
    >
      {children}
    </div>
  );
}

type SportFilter = Sport | 'ALL' | 'SOCCER';
const FILTERS: SportFilter[] = ['ALL', 'NBA', 'NFL', 'MLB', 'SOCCER', 'TENNIS'];
const SOCCER_SPORTS: Sport[] = ['EPL', 'LALIGA', 'BUNDESLIGA', 'SERIEA', 'WORLDCUP'];

const SPORT_LABEL: Partial<Record<Sport, string>> = {
  EPL:        'Premier League',
  LALIGA:     'La Liga',
  BUNDESLIGA: 'Bundesliga',
  SERIEA:     'Serie A',
  WORLDCUP:   'World Cup',
  TENNIS:     'Tennis',
};
function sportName(sport: Sport): string { return SPORT_LABEL[sport] ?? sport; }

function isLocked(commenceTime: string) {
  return new Date(commenceTime).getTime() - Date.now() < 15 * 60 * 1000;
}

function fmtTime(iso: string) {
  try {
    const d        = new Date(iso);
    const today    = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dayLabel =
      d.toDateString() === today.toDateString()    ? 'Today' :
      d.toDateString() === tomorrow.toDateString() ? 'Tomorrow' :
      d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    return `${dayLabel} · ${time}`;
  } catch { return iso; }
}

export default function MoneylineGrid({ matches }: { matches: Match[] }) {
  const [sport, setSport]           = useState<SportFilter>('ALL');
  const [sheetMatch, setSheetMatch] = useState<Match | null>(null);

  const user       = useUserStore((s) => s.user);
  const submitPick = useUserStore((s) => s.submitPick);
  const cancelPick = useUserStore((s) => s.cancelPick);

  const kFactor = getKFactor(user.totalPicks, user.weeksActive);

  const upcoming = matches.filter((m) => new Date(m.commenceTime).getTime() > Date.now());

  // Games already under way. The board has always filtered these out, so they
  // simply vanished mid-game; they now surface in a display-only rail above
  // the board. Respects the sport filter so it never contradicts the chips.
  const liveAll = matches.filter((m) => m.status === 'live');
  const live =
    sport === 'ALL'    ? liveAll :
    sport === 'SOCCER' ? liveAll.filter((m) => SOCCER_SPORTS.includes(m.sport)) :
    liveAll.filter((m) => m.sport === sport);
  const visible =
    sport === 'ALL'    ? upcoming :
    sport === 'SOCCER' ? upcoming.filter((m) => SOCCER_SPORTS.includes(m.sport)) :
    upcoming.filter((m) => m.sport === sport);

  function getPendingMoneyline(matchId: string): UserPick | undefined {
    return user.picks.find(
      (p) => p.matchId === matchId && p.betType === 'moneyline' && p.outcome === 'pending',
    );
  }

  // Called once a 3-second hold completes. Removal is handled separately by
  // HoldToPick (a plain tap), so this only ever places — swapping sides when a
  // pick already exists on the other team.
  function placeMoneyline(match: Match, side: 'home' | 'away') {
    if (isLocked(match.commenceTime)) return;
    const existing = getPendingMoneyline(match.id);
    if (existing) cancelPick(existing.id);

    const eventElo = side === 'home' ? match.eventElos.moneylineHome : match.eventElos.moneylineAway;
    const proj     = calculateEloDelta({ userElo: user.globalElo, eventElo, kFactor, confidenceLevel: 'medium', betType: 'moneyline', outcome: 'win' });
    const xpEarned = calculatePickXP(user, 'moneyline', 'medium');

    const pick: UserPick = {
      id:               crypto.randomUUID(),
      matchId:          match.id,
      sport:            match.sport,
      gameTime:         match.commenceTime,
      matchDescription: `${match.homeTeam} vs ${match.awayTeam}`,
      spreadLine:       match.spreadLine,
      overUnderLine:    match.overUnderLine,
      betType:          'moneyline',
      pickSide:         side,
      confidenceLevel:  'medium',
      userEloAtPick:    user.globalElo,
      eventElo,
      projectedGain:    proj.projectedGain,
      projectedLoss:    proj.projectedLoss,
      outcome:          'pending',
      eloDelta:         null,
      xpEarned,
      placedAt:         new Date().toISOString(),
    };
    submitPick(pick);   // HoldToPick already fired the success haptic
  }

  const todayLine = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  // Net Elo over the last 7 days, from picks that settled in that window.
  const weekAgo     = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weeklyDelta = user.picks.reduce((sum, p) => {
    if (p.eloDelta == null) return sum;
    const settled = p.resolvedAt ?? p.gameTime;
    return settled && new Date(settled).getTime() >= weekAgo ? sum + p.eloDelta : sum;
  }, 0);

  return (
    <div className={`min-h-screen max-w-md mx-auto px-4 pt-4 ${
      user.picks.some((p) => p.outcome === 'pending') ? 'pb-44' : 'pb-28'
    }`}>

      {/* The BallIQ wordmark and the rating both live in the fixed top bar now,
          so the board opens straight onto the games. */}
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[11px] text-dim">
          {todayLine} · {upcoming.length} game{upcoming.length !== 1 ? 's' : ''}
        </p>
        {weeklyDelta !== 0 && (
          <p className={`text-[11px] font-black tabular-nums ${weeklyDelta > 0 ? 'text-good' : 'text-bad'}`}>
            {weeklyDelta > 0 ? '▲ +' : '▼ '}{Math.abs(weeklyDelta)} this week
          </p>
        )}
      </div>

      <RecapBanner />

      {/* Sport filter — larger type now that the header block is gone */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-0.5 -mx-4 px-4">
        {FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => { hapticImpact('light'); setSport(s); }}
            className={`shrink-0 py-2.5 px-5 rounded-xl text-sm font-black tracking-wide transition active:scale-95 ${
              sport === s
                ? 'bg-accent text-white shadow-lg shadow-accent/20'
                : 'bg-card text-sub border border-rim hover:border-sub'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <LiveStrip matches={live} />

      {/* Game cards */}
      {visible.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📅</p>
          <p className="font-bold text-ink mb-1">
            No {sport === 'ALL' ? '' : sport === 'SOCCER' ? 'soccer ' : sportName(sport as Sport) + ' '}games right now
          </p>
          {/* Point at a sport that actually has games rather than at the
              manual sync button, which no longer exists. */}
          {sport !== 'ALL' && upcoming.length > 0 ? (
            <button
              onClick={() => { hapticImpact('light'); setSport('ALL'); }}
              className="mt-1 text-sm font-bold text-accent active:scale-95 transition"
            >
              See all {upcoming.length} game{upcoming.length !== 1 ? 's' : ''} →
            </button>
          ) : (
            <p className="text-sm text-dim">
              The board fills as games are scheduled — check back soon.
            </p>
          )}
        </div>
      ) : (
        <>
        <p className="text-[11px] text-dim mb-2 px-0.5">
          Press and hold a team to lock it in · hold the card header for margin &amp; totals
        </p>
        <div className="flex flex-col gap-1.5">
          {visible.map((match) => {
            const pick   = getPendingMoneyline(match.id);
            const locked = isLocked(match.commenceTime);

            const homeElo  = match.eventElos.moneylineHome;
            const awayElo  = match.eventElos.moneylineAway;
            const homeProj = calculateEloDelta({ userElo: user.globalElo, eventElo: homeElo, kFactor, confidenceLevel: 'medium', betType: 'moneyline', outcome: 'win' });
            const awayProj = calculateEloDelta({ userElo: user.globalElo, eventElo: awayElo, kFactor, confidenceLevel: 'medium', betType: 'moneyline', outcome: 'win' });

            return (
              <LongPressCard key={match.id} onLongPress={() => setSheetMatch(match)}>
                {/* Header — ~1.7x its old height, and the sport/time now read
                    at a glance instead of needing a squint */}
                <div className="flex items-center justify-between px-3.5 py-2.5 bg-layer border-b border-rim">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-black text-accent uppercase tracking-widest">{sportName(match.sport)}</span>
                    <span className="text-dim text-[10px]">·</span>
                    <span className="text-[12px] font-semibold text-sub">{fmtTime(match.commenceTime)}</span>
                  </div>
                  <Link
                    href={`/matches/${match.id}`}
                    className="flex items-center gap-0.5 text-dim hover:text-accent transition text-[11px] font-bold"
                  >
                    More picks <span className="text-sm leading-none">›</span>
                  </Link>
                </div>

                {/* No probability bar here — each team button already states
                    its own "{odds} · {n}% favorite/underdog", so the bar was
                    saying the same thing twice and costing card height. */}

                {/* Team buttons */}
                <div className="grid grid-cols-2">
                  {(['home', 'away'] as const).map((side) => {
                    const team     = side === 'home' ? match.homeTeam : match.awayTeam;
                    const proj     = side === 'home' ? homeProj : awayProj;
                    const selected = pick?.pickSide === side;

                    return (
                      <HoldToPick
                        key={side}
                        selected={selected}
                        disabled={locked}
                        onCommit={() => placeMoneyline(match, side)}
                        onRemove={() => { const p = getPendingMoneyline(match.id); if (p) cancelPick(p.id); }}
                        className={`flex flex-col items-center py-2 px-1.5 transition-colors ${
                          side === 'away' ? 'border-l border-rim' : ''
                        } ${locked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-layer'}`}
                        selectedClassName="bg-pick/15 ring-1 ring-inset ring-pick/50"
                      >
                        <TeamAvatar teamName={team} size="xs" />
                        <p className={`font-black text-xs leading-tight mt-0.5 ${selected ? 'text-pick' : 'text-ink'}`}>
                          {team}
                        </p>
                        <p className={`text-base font-black tabular-nums leading-tight ${selected ? 'text-pick' : 'text-good'}`}>
                          ▲ +{proj.projectedGain}
                          <span className="ml-0.5 text-[9px] font-bold">Elo</span>
                        </p>
                        {/* No per-button hint here — the list header already
                            explains the gesture, and an extra line is exactly
                            the height this card can't spare. */}
                        {locked && <span className="mt-0.5 text-[8px] text-dim">Locked</span>}
                      </HoldToPick>
                    );
                  })}
                </div>
              </LongPressCard>
            );
          })}
        </div>
        </>
      )}

      {/* Long-press bet sheet */}
      {sheetMatch && <BetSheet match={sheetMatch} onClose={() => setSheetMatch(null)} />}

      <PendingPicksBar />
    </div>
  );
}

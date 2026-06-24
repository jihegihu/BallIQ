'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserStore } from '@/lib/userStore';
import { calculatePickXP } from '@/lib/userStore';
import { calculateEloDelta, getKFactor } from '@/lib/elo';
import { Match, Sport, UserPick } from '@/types';
import TeamAvatar from '@/components/TeamAvatar';
import RecapBanner from '@/components/RecapBanner';
import PendingPicksBar from '@/components/PendingPicksBar';
import { eventEloToProb } from '@/lib/elo';

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

function fmtOdds(o: number) {
  return o > 0 ? `+${o}` : `${o}`;
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
  const [sport, setSport]     = useState<SportFilter>('ALL');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [, startTransition]   = useTransition();
  const router                = useRouter();

  const user       = useUserStore((s) => s.user);
  const submitPick = useUserStore((s) => s.submitPick);
  const cancelPick = useUserStore((s) => s.cancelPick);
  const hydrate    = useUserStore((s) => s.hydrate);

  const kFactor = getKFactor(user.totalPicks, user.weeksActive);

  const upcoming = matches.filter((m) => new Date(m.commenceTime).getTime() > Date.now());
  const visible =
    sport === 'ALL'    ? upcoming :
    sport === 'SOCCER' ? upcoming.filter((m) => SOCCER_SPORTS.includes(m.sport)) :
    upcoming.filter((m) => m.sport === sport);

  function getPendingMoneyline(matchId: string): UserPick | undefined {
    return user.picks.find(
      (p) => p.matchId === matchId && p.betType === 'moneyline' && p.outcome === 'pending',
    );
  }

  function handleTeamClick(match: Match, side: 'home' | 'away') {
    if (isLocked(match.commenceTime)) return;
    const existing = getPendingMoneyline(match.id);

    if (existing) {
      cancelPick(existing.id);
      if (existing.pickSide === side) return;
    }

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
    submitPick(pick);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res  = await fetch('/api/sync-odds', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setSyncMsg(`Error: ${data.error ?? res.statusText}`);
      } else if (data.quotaExhausted) {
        // Quota wall — say so plainly rather than showing a misleading "0 games"
        setSyncMsg(data.error);
      } else {
        const parts = [`Synced ${data.synced} match${data.synced !== 1 ? 'es' : ''}`];
        if (data.resolved > 0) parts.push(`resolved ${data.resolved} pick${data.resolved !== 1 ? 's' : ''}`);
        if (data.scoresError)  parts.push('scores unavailable');
        setSyncMsg(parts.join(' · '));

        if (data.resolved > 0) {
          const pr = await fetch('/api/picks');
          const pd = await pr.json();
          if (pd.picks !== undefined) hydrate(pd.picks ?? [], pd.user ?? {});
        }
        startTransition(() => router.refresh());
      }
    } catch { setSyncMsg('Network error'); }
    finally   { setSyncing(false); }
  }

  const todayLine = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className={`min-h-screen max-w-md mx-auto px-4 pt-4 ${
      user.picks.some((p) => p.outcome === 'pending') ? 'pb-40' : 'pb-24'
    }`}>

      {/* Top row: title + sync */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black text-ink leading-none">
            Ball<span className="text-accent">IQ</span>
          </h1>
          <p className="text-[11px] text-sub mt-1">
            {todayLine}
            <span className="text-dim"> · {upcoming.length} game{upcoming.length !== 1 ? 's' : ''} on the board</span>
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          aria-label="Refresh odds and results"
          className="flex items-center gap-1.5 bg-card border border-rim rounded-full px-3.5 py-2 text-xs font-bold text-sub hover:border-accent/40 hover:text-ink transition disabled:opacity-50"
        >
          <span className={`text-accent ${syncing ? 'animate-spin inline-block' : ''}`}>⟳</span>
          {syncing ? 'Syncing…' : 'Refresh'}
        </button>
      </div>

      {syncMsg && (
        <p className="text-[11px] text-sub mb-3" role="status">{syncMsg}</p>
      )}

      <RecapBanner />

      {/* Sport filter */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-0.5 -mx-4 px-4">
        {FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setSport(s)}
            className={`shrink-0 py-2 px-4 rounded-xl text-xs font-black transition ${
              sport === s
                ? 'bg-violet-600 text-white'
                : 'bg-card text-dim border border-rim hover:border-sub'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Game cards */}
      {visible.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📅</p>
          <p className="font-bold text-ink mb-1">
            No {sport === 'ALL' ? '' : sport === 'SOCCER' ? 'soccer ' : sportName(sport as Sport) + ' '}games right now
          </p>
          <p className="text-sm text-dim">Try syncing or check another sport.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visible.map((match) => {
            const pick   = getPendingMoneyline(match.id);
            const locked = isLocked(match.commenceTime);

            const homeElo  = match.eventElos.moneylineHome;
            const awayElo  = match.eventElos.moneylineAway;
            const homeProj = calculateEloDelta({ userElo: user.globalElo, eventElo: homeElo, kFactor, confidenceLevel: 'medium', betType: 'moneyline', outcome: 'win' });
            const awayProj = calculateEloDelta({ userElo: user.globalElo, eventElo: awayElo, kFactor, confidenceLevel: 'medium', betType: 'moneyline', outcome: 'win' });

            return (
              <div key={match.id} className="bg-card border border-rim rounded-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-2.5 py-1 bg-layer border-b border-rim">
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] font-black text-accent/80 uppercase tracking-widest">{sportName(match.sport)}</span>
                    <span className="text-dim text-[8px]">·</span>
                    <span className="text-[9px] text-sub">{fmtTime(match.commenceTime)}</span>
                  </div>
                  <Link
                    href={`/matches/${match.id}`}
                    className="flex items-center gap-0.5 text-dim hover:text-accent transition text-[9px] font-semibold"
                  >
                    All picks <span className="text-xs leading-none">›</span>
                  </Link>
                </div>

                {/* Win probability bar */}
                {(() => {
                  const homeProb = Math.round(eventEloToProb(match.eventElos.moneylineHome) * 100);
                  return (
                    <div className="px-2.5 pb-0.5 pt-1">
                      <div className="relative h-1 bg-layer rounded-full overflow-hidden">
                        <div className="absolute left-0 top-0 h-full bg-accent/50 rounded-full" style={{ width: `${homeProb}%` }} />
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-[8px] text-dim">{homeProb}%</span>
                        <span className="text-[8px] text-dim">{100 - homeProb}%</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Team buttons */}
                <div className="grid grid-cols-2">
                  {(['home', 'away'] as const).map((side) => {
                    const team     = side === 'home' ? match.homeTeam : match.awayTeam;
                    const odds     = side === 'home' ? match.moneylineHome : match.moneylineAway;
                    const proj     = side === 'home' ? homeProj : awayProj;
                    const selected = pick?.pickSide === side;

                    return (
                      <button
                        key={side}
                        onClick={() => handleTeamClick(match, side)}
                        disabled={locked}
                        className={`flex flex-col items-center py-2 px-1.5 transition-all active:scale-95 ${
                          side === 'away' ? 'border-l border-rim' : ''
                        } ${
                          selected
                            ? 'bg-accent/15 border-accent/30'
                            : locked
                            ? 'opacity-40 cursor-not-allowed'
                            : 'hover:bg-layer'
                        }`}
                      >
                        <TeamAvatar teamName={team} size="xs" />
                        <p className={`font-black text-xs leading-tight mt-0.5 ${selected ? 'text-accent' : 'text-ink'}`}>
                          {team}
                        </p>
                        <p className={`text-sm font-black tabular-nums mb-0.5 ${selected ? 'text-violet-300' : 'text-ink'}`}>
                          {fmtOdds(odds)}
                        </p>
                        <p className="text-[8px] text-dim tabular-nums">
                          <span className="text-emerald-500">+{proj.projectedGain}</span>
                          <span className="mx-0.5 text-rim">/</span>
                          <span className="text-red-500">-{proj.projectedLoss}</span>
                          <span className="ml-0.5">Elo</span>
                        </p>
                        {locked && <span className="mt-0.5 text-[8px] text-dim">Locked</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PendingPicksBar />
    </div>
  );
}

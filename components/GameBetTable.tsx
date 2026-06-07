'use client';

import { useRouter } from 'next/navigation';
import { useUserStore } from '@/lib/userStore';
import { calculatePickXP } from '@/lib/userStore';
import { calculateEloDelta, getKFactor } from '@/lib/elo';
import { Match, BetType, PickSide, UserPick } from '@/types';

function fmtOdds(o: number) { return o > 0 ? `+${o}` : `${o}`; }

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

type Cell = { betType: BetType; pickSide: PickSide; odds: number; lineLabel: string; eventElo: number };

function buildRows(match: Match): { team: string; cells: [Cell, Cell, Cell] }[] {
  const awaySpread    = match.spreadLine === 0 ? 0 : -match.spreadLine;
  const homeSpreadStr = match.spreadLine > 0 ? `+${match.spreadLine}` : `${match.spreadLine}`;
  const awaySpreadStr = awaySpread > 0 ? `+${awaySpread}` : `${awaySpread}`;

  return [
    {
      team: match.homeTeam,
      cells: [
        { betType: 'moneyline',  pickSide: 'home', odds: match.moneylineHome,  lineLabel: '',                         eventElo: match.eventElos.moneylineHome },
        { betType: 'spread',     pickSide: 'home', odds: match.spreadHomeOdds, lineLabel: homeSpreadStr,              eventElo: match.eventElos.spreadHome    },
        { betType: 'over_under', pickSide: 'over', odds: match.overOdds,       lineLabel: `O ${match.overUnderLine}`, eventElo: match.eventElos.over          },
      ],
    },
    {
      team: match.awayTeam,
      cells: [
        { betType: 'moneyline',  pickSide: 'away',  odds: match.moneylineAway,  lineLabel: '',                         eventElo: match.eventElos.moneylineAway },
        { betType: 'spread',     pickSide: 'away',  odds: match.spreadAwayOdds, lineLabel: awaySpreadStr,              eventElo: match.eventElos.spreadAway    },
        { betType: 'over_under', pickSide: 'under', odds: match.underOdds,      lineLabel: `U ${match.overUnderLine}`, eventElo: match.eventElos.under         },
      ],
    },
  ];
}

export default function GameBetTable({ match }: { match: Match }) {
  const router     = useRouter();
  const user       = useUserStore((s) => s.user);
  const submitPick = useUserStore((s) => s.submitPick);
  const cancelPick = useUserStore((s) => s.cancelPick);

  const kFactor = getKFactor(user.totalPicks, user.weeksActive);
  const locked  = isLocked(match.commenceTime);
  const rows    = buildRows(match);

  function getPickFor(betType: BetType, pickSide: PickSide): UserPick | undefined {
    return user.picks.find(
      (p) => p.matchId === match.id && p.betType === betType && p.pickSide === pickSide && p.outcome === 'pending',
    );
  }

  function handleCell(cell: Cell) {
    if (locked) return;
    const existing = getPickFor(cell.betType, cell.pickSide);
    if (existing) { cancelPick(existing.id); return; }

    const sameTypePick = user.picks.find(
      (p) => p.matchId === match.id && p.betType === cell.betType && p.outcome === 'pending',
    );
    if (sameTypePick) cancelPick(sameTypePick.id);

    const proj     = calculateEloDelta({ userElo: user.globalElo, eventElo: cell.eventElo, kFactor, confidenceLevel: 'medium', betType: cell.betType, outcome: 'win' });
    const xpEarned = calculatePickXP(user, cell.betType, 'medium');

    const pick: UserPick = {
      id:               crypto.randomUUID(),
      matchId:          match.id,
      sport:            match.sport,
      gameTime:         match.commenceTime,
      matchDescription: `${match.homeTeam} vs ${match.awayTeam}`,
      spreadLine:       match.spreadLine,
      overUnderLine:    match.overUnderLine,
      betType:          cell.betType,
      pickSide:         cell.pickSide,
      confidenceLevel:  'medium',
      userEloAtPick:    user.globalElo,
      eventElo:         cell.eventElo,
      projectedGain:    proj.projectedGain,
      projectedLoss:    proj.projectedLoss,
      outcome:          'pending',
      eloDelta:         null,
      xpEarned,
      placedAt:         new Date().toISOString(),
    };
    submitPick(pick);
  }

  return (
    <div className="min-h-screen pb-24 max-w-md mx-auto px-4 pt-4">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sub hover:text-ink text-sm mb-5 transition"
      >
        ‹ Back
      </button>

      {/* Match header */}
      <div className="bg-card border border-rim rounded-2xl p-4 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-black text-accent/80 uppercase tracking-widest">{match.sport}</span>
          <span className="text-dim">·</span>
          <span className="text-xs text-sub">{fmtTime(match.commenceTime)}</span>
        </div>
        <p className="font-black text-ink text-lg">{match.homeTeam} vs {match.awayTeam}</p>
        {locked && (
          <p className="text-xs text-dim mt-1">🔒 Picks locked — game starting soon</p>
        )}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-4 mb-1 px-1">
        <div />
        {['Moneyline', 'Spread', 'Over/Under'].map((h) => (
          <p key={h} className="text-center text-[10px] text-dim uppercase tracking-widest font-bold">{h}</p>
        ))}
      </div>

      {/* Table rows */}
      <div className="bg-card border border-rim rounded-2xl overflow-hidden">
        {rows.map((row, ri) => (
          <div
            key={row.team}
            className={`grid grid-cols-4 ${ri < rows.length - 1 ? 'border-b border-rim' : ''}`}
          >
            {/* Team name */}
            <div className="flex items-center px-3 py-4 border-r border-rim">
              <p className="font-black text-ink text-xs leading-tight">{row.team}</p>
            </div>

            {/* Bet cells */}
            {row.cells.map((cell, ci) => {
              const selected = !!getPickFor(cell.betType, cell.pickSide);
              const proj     = calculateEloDelta({ userElo: user.globalElo, eventElo: cell.eventElo, kFactor, confidenceLevel: 'medium', betType: cell.betType, outcome: 'win' });

              return (
                <button
                  key={ci}
                  onClick={() => handleCell(cell)}
                  disabled={locked}
                  className={`flex flex-col items-center justify-center py-3 px-1 transition-all active:scale-95 border-r border-rim last:border-r-0 ${
                    selected
                      ? 'bg-accent/15'
                      : locked
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-layer'
                  }`}
                >
                  {cell.lineLabel && (
                    <p className={`text-[10px] font-bold mb-0.5 ${selected ? 'text-accent' : 'text-sub'}`}>
                      {cell.lineLabel}
                    </p>
                  )}
                  <p className={`text-sm font-black tabular-nums ${selected ? 'text-violet-300' : 'text-ink'}`}>
                    {fmtOdds(cell.odds)}
                  </p>
                  <p className="text-[9px] text-dim tabular-nums mt-0.5">
                    <span className="text-emerald-600">+{proj.projectedGain}</span>
                    <span className="mx-0.5">/</span>
                    <span className="text-red-600">-{proj.projectedLoss}</span>
                  </p>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="text-center text-[11px] text-dim mt-4">
        Tap any cell to pick · tap again to remove
      </p>
    </div>
  );
}

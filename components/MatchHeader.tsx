'use client';

// Hero header for one game: teams + records, win-probability bar, and the
// free ESPN details (venue, broadcast) when present. `compact` renders the
// tighter version used inside the long-press BetSheet.

import { Match, Sport } from '@/types';
import { eventEloToProb } from '@/lib/elo';
import TeamAvatar from '@/components/TeamAvatar';

const SPORT_LABEL: Partial<Record<Sport, string>> = {
  EPL:        'Premier League',
  LALIGA:     'La Liga',
  BUNDESLIGA: 'Bundesliga',
  SERIEA:     'Serie A',
  WORLDCUP:   'World Cup',
  TENNIS:     'Tennis',
};

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

export default function MatchHeader({ match, compact = false }: { match: Match; compact?: boolean }) {
  const homeProb = Math.round(eventEloToProb(match.eventElos.moneylineHome) * 100);

  const detailBits = [match.venue, match.broadcast].filter(Boolean) as string[];

  return (
    <div>
      {/* Sport · time */}
      <div className="flex items-center justify-center gap-1.5 mb-3">
        <span className="text-[10px] font-black text-accent/80 uppercase tracking-widest">
          {SPORT_LABEL[match.sport] ?? match.sport}
        </span>
        <span className="text-dim text-[10px]">·</span>
        <span className="text-[11px] text-sub font-semibold">{fmtTime(match.commenceTime)}</span>
      </div>

      {/* Teams */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {(['home', 'away'] as const).map((side, i) => {
          const team   = side === 'home' ? match.homeTeam : match.awayTeam;
          const record = side === 'home' ? match.homeRecord : match.awayRecord;
          return (
            <div key={side} className={`flex flex-col items-center ${i === 1 ? 'order-3' : 'order-1'}`}>
              <TeamAvatar teamName={team} size={compact ? 'sm' : 'md'} />
              <p className={`font-black text-ink text-center leading-tight mt-1.5 ${compact ? 'text-sm' : 'text-base'}`}>
                {team}
              </p>
              {record && (
                <p className="text-[10px] text-dim tabular-nums mt-0.5">{record}</p>
              )}
            </div>
          );
        })}
        <p className="order-2 text-dim font-black text-xs uppercase">vs</p>
      </div>

      {/* Win probability */}
      <div className={compact ? 'mt-3' : 'mt-4'}>
        <div className="relative h-1.5 bg-layer rounded-full overflow-hidden">
          <div className="absolute left-0 top-0 h-full bg-accent/60 rounded-full" style={{ width: `${homeProb}%` }} />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-dim tabular-nums">{homeProb}% win</span>
          <span className="text-[10px] text-dim tabular-nums">{100 - homeProb}% win</span>
        </div>
      </div>

      {/* Venue / broadcast (ESPN, when available) */}
      {detailBits.length > 0 && (
        <p className={`text-center text-[11px] text-dim ${compact ? 'mt-1.5' : 'mt-2.5'}`}>
          {detailBits.join('  ·  ')}
        </p>
      )}
    </div>
  );
}

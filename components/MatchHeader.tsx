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

export default function MatchHeader({
  match,
  compact = false,
  dragHandlers,
}: {
  match: Match;
  compact?: boolean;
  /**
   * Spread onto the sport/teams block so a sheet can use it as a drag
   * surface. Nothing in that block is interactive — it is logos, names and
   * "vs" — so handing the whole area to the gesture costs no tap targets and
   * makes the sheet far easier to flick away. The probability bar below is
   * left out on purpose: it is the first thing worth reading rather than
   * grabbing.
   */
  dragHandlers?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const homeProb = Math.round(eventEloToProb(match.eventElos.moneylineHome) * 100);

  const detailBits = [match.venue, match.broadcast].filter(Boolean) as string[];

  return (
    <div>
      {/* Drag zone: sport line through the teams row.
          pan-y rather than touch-none, deliberately. touch-none would stop the
          sheet scrolling whenever a finger happened to land on the header. With
          pan-y the browser keeps scrolling: dragging UP scrolls the content and
          fires pointercancel, which aborts the drag, while dragging DOWN at the
          top has nowhere to scroll, so the dismiss gesture runs. Both work. */}
      <div {...dragHandlers} className={dragHandlers ? 'touch-pan-y cursor-grab active:cursor-grabbing' : undefined}>
      {/* Sport · time */}
      <div className="flex items-center justify-center gap-1.5 mb-3">
        <span className="text-xs font-black text-accent uppercase tracking-widest">
          {SPORT_LABEL[match.sport] ?? match.sport}
        </span>
        <span className="text-dim text-xs">·</span>
        <span className="text-xs text-sub font-semibold">{fmtTime(match.commenceTime)}</span>
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
                <p className="text-xs text-dim tabular-nums mt-0.5">{record}</p>
              )}
            </div>
          );
        })}
        <p className="order-2 text-dim font-black text-xs uppercase">vs</p>
      </div>
      </div>

      {/* Win probability */}
      <div className={compact ? 'mt-3' : 'mt-4'}>
        <div className="relative h-1.5 bg-layer rounded-full overflow-hidden">
          <div className="absolute left-0 top-0 h-full bg-accent/60 rounded-full" style={{ width: `${homeProb}%` }} />
        </div>
        {/* Both ends used to read "% win", which says nothing about who. */}
        <div className="flex justify-between mt-1">
          <span className="text-xs text-dim tabular-nums">{homeProb}%</span>
          <span className="text-[11px] text-dim uppercase tracking-widest font-bold">chance</span>
          <span className="text-xs text-dim tabular-nums">{100 - homeProb}%</span>
        </div>
      </div>

      {/* Venue / broadcast (ESPN, when available) */}
      {detailBits.length > 0 && (
        <p className={`text-center text-xs text-dim ${compact ? 'mt-1.5' : 'mt-2.5'}`}>
          {detailBits.join('  ·  ')}
        </p>
      )}
    </div>
  );
}

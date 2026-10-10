'use client';

// "Live now" — games already under way, shown above the board.
//
// Scope is deliberately small: display only. No pick buttons, no gestures,
// nothing that can interact with the hold-to-pick flow below it. Picks are
// already locked 15 minutes before kickoff, so a live game was never pickable
// anyway; it was simply invisible, because the board filters to games that
// have not started.
//
// Honest limitation: `status` and the scores are written by the odds sync, so
// this is "live as of the last sync", not a real-time feed. Pull to refresh
// pulls the latest. Making it genuinely live would need a much faster poll
// than the odds budget allows.

import Link from 'next/link';
import { Match } from '@/types';
import TeamAvatar from '@/components/TeamAvatar';
import { hapticImpact } from '@/lib/haptics';

function shortName(team: string): string {
  const parts = team.split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : team;
}

export default function LiveStrip({ matches }: { matches: Match[] }) {
  if (matches.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2 px-0.5">
        <span className="relative flex w-2 h-2">
          <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-70 animate-ping" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400" />
        </span>
        <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">
          Live now
        </p>
        <span className="text-xs text-dim">· {matches.length}</span>
      </div>

      {/* Horizontal rail: live games are a glance, not the main event. */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
        {matches.map((m) => {
          const hasScore = m.homeScore != null && m.awayScore != null;
          return (
            <Link
              key={m.id}
              href={`/matches/${m.id}`}
              onClick={() => hapticImpact('light')}
              className="shrink-0 w-40 bg-card border border-emerald-500/25 rounded-xl p-2.5 active:scale-95 transition"
            >
              {(['away', 'home'] as const).map((side) => {
                const team  = side === 'home' ? m.homeTeam : m.awayTeam;
                const score = side === 'home' ? m.homeScore : m.awayScore;
                const other = side === 'home' ? m.awayScore : m.homeScore;
                const leading = hasScore && score != null && other != null && score > other;
                return (
                  <div key={side} className="flex items-center gap-2 py-0.5">
                    <TeamAvatar teamName={team} size="xs" />
                    <span className={`flex-1 min-w-0 truncate text-xs font-bold ${leading ? 'text-ink' : 'text-sub'}`}>
                      {shortName(team)}
                    </span>
                    <span className={`text-sm font-black tabular-nums ${leading ? 'text-ink' : 'text-sub'}`}>
                      {hasScore ? score : '–'}
                    </span>
                  </div>
                );
              })}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

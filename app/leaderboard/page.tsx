'use client';

import { useState, useEffect } from 'react';

type SportTab = 'global' | 'nba' | 'nfl' | 'mlb' | 'soccer' | 'tennis';
type LeaderRow = {
  id: string;
  username: string;
  global_elo: number;
  season_elo: number;
  nba_elo: number;
  nfl_elo: number;
  mlb_elo: number;
  soccer_elo: number;
  tennis_elo: number;
  total_picks: number;
  current_streak: number;
};

const TABS: { key: SportTab; label: string }[] = [
  { key: 'global', label: 'Global' },
  { key: 'nba',    label: 'NBA'    },
  { key: 'nfl',    label: 'NFL'    },
  { key: 'mlb',    label: 'MLB'    },
  { key: 'soccer', label: 'Soccer' },
  { key: 'tennis', label: 'Tennis' },
];

const ELO_KEY: Record<SportTab, keyof LeaderRow> = {
  global: 'global_elo',
  nba:    'nba_elo',
  nfl:    'nfl_elo',
  mlb:    'mlb_elo',
  soccer: 'soccer_elo',
  tennis: 'tennis_elo',
};

const RANK_ICONS = ['🥇', '🥈', '🥉'];

function rankLabel(elo: number): string {
  if (elo >= 2000) return 'Elite';
  if (elo >= 1600) return 'Expert';
  if (elo >= 1200) return 'Advanced';
  if (elo >= 800)  return 'Intermediate';
  return 'Rookie';
}

export default function LeaderboardPage() {
  const [sport, setSport]     = useState<SportTab>('global');
  const [rows, setRows]       = useState<LeaderRow[]>([]);
  const [myId, setMyId]       = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/leaderboard?sport=${sport}`)
      .then((r) => r.json())
      .then(({ users, myId: me, error: e }) => {
        if (cancelled) return;
        if (e) { setError(e); return; }
        setRows(users ?? []);
        setMyId(me ?? null);
      })
      .catch(() => { if (!cancelled) setError('Failed to load leaderboard'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sport]);

  const myRank = myId ? rows.findIndex((r) => r.id === myId) + 1 : 0;

  return (
    <main className="min-h-screen pb-24 max-w-md mx-auto px-4 pt-4">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-ink">Rankings</h1>
        <p className="text-[11px] text-dim mt-0.5">Top 50 by Elo rating</p>
      </div>

      {/* Your rank banner */}
      {myRank > 0 && (
        <div className="mb-4 bg-accent/5 border border-accent/20 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-dim uppercase tracking-widest">Your Rank</p>
            <p className="text-lg font-black text-accent">#{myRank}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-dim uppercase tracking-widest">Elo</p>
            <p className="text-lg font-black text-ink tabular-nums">
              {(rows[myRank - 1]?.[ELO_KEY[sport]] as number)?.toLocaleString() ?? '—'}
            </p>
          </div>
        </div>
      )}

      {/* Sport tabs */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-0.5 -mx-4 px-4">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSport(key)}
            className={`shrink-0 py-1.5 px-3.5 rounded-xl text-xs font-black transition ${
              sport === key
                ? 'bg-violet-600 text-white'
                : 'bg-card text-dim border border-rim hover:border-sub'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col gap-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-14 bg-card border border-rim rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-center py-10">
          <p className="text-dim text-sm">Could not load leaderboard.</p>
          <p className="text-dim text-xs mt-1">{error}</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && rows.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🏆</p>
          <p className="font-bold text-ink mb-1">No rankings yet</p>
          <p className="text-sm text-dim">Be the first to make picks and claim the top spot.</p>
        </div>
      )}

      {/* Rows */}
      {!loading && !error && rows.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {rows.map((row, idx) => {
            const elo  = row[ELO_KEY[sport]] as number;
            const isMe = row.id === myId;
            const rank = idx + 1;

            return (
              <div
                key={row.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition ${
                  isMe
                    ? 'bg-accent/5 border-accent/30'
                    : 'bg-card border-rim'
                }`}
              >
                {/* Rank */}
                <div className="w-7 text-center shrink-0">
                  {rank <= 3
                    ? <span className="text-base">{RANK_ICONS[rank - 1]}</span>
                    : <span className="text-xs font-black text-dim">#{rank}</span>
                  }
                </div>

                {/* Name + badge */}
                <div className="flex-1 min-w-0">
                  <p className={`font-black text-sm truncate ${isMe ? 'text-accent' : 'text-ink'}`}>
                    {row.username ?? 'Player'}
                    {isMe && <span className="ml-1 text-[9px] font-bold opacity-70">(you)</span>}
                  </p>
                  <p className="text-[10px] text-dim">{rankLabel(elo)} · {row.total_picks} picks</p>
                </div>

                {/* Streak */}
                {row.current_streak >= 3 && (
                  <span className="text-[10px] font-bold text-orange-400">{row.current_streak}🔥</span>
                )}

                {/* Elo */}
                <span className={`text-sm font-black tabular-nums shrink-0 ${isMe ? 'text-accent' : 'text-ink'}`}>
                  {elo?.toLocaleString() ?? '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {rows.length > 0 && (
        <p className="text-center text-[10px] text-dim mt-5">
          Updates after each game settles
        </p>
      )}
    </main>
  );
}

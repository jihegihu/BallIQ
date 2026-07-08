'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useUserStore } from '@/lib/userStore';

type Scope = 'global' | 'friends';
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
  wins: number;
  losses: number;
  weekly_delta: number;
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
  const [scope, setScope]     = useState<Scope>('global');
  const [sport, setSport]     = useState<SportTab>('global');
  const [rows, setRows]       = useState<LeaderRow[]>([]);
  const [myId, setMyId]       = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  // Add-friend controls (friends scope only)
  const [addInput, setAddInput] = useState('');
  const [addMsg, setAddMsg]     = useState('');
  const [busy, setBusy]         = useState(false);

  const loadBoard = useCallback(() => {
    setLoading(true);
    setError('');
    return fetch(`/api/leaderboard?sport=${sport}&scope=${scope}`)
      .then((r) => r.json())
      .then(({ users, myId: me, error: e }) => {
        if (e) { setError(e); return; }
        setRows(users ?? []);
        setMyId(me ?? null);
      })
      .catch(() => setError('Failed to load leaderboard'))
      .finally(() => setLoading(false));
  }, [sport, scope]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const name = addInput.trim();
    if (!name || busy) return;
    setBusy(true);
    setAddMsg('');
    try {
      const res  = await fetch('/api/friends', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name }),
      });
      const data = await res.json();
      if (data.added) { setAddInput(''); setAddMsg(`Added ${data.friend.username}`); await loadBoard(); }
      else setAddMsg(data.reason ?? 'Could not add that player');
    } catch { setAddMsg('Network error'); }
    finally { setBusy(false); }
  }

  async function handleRemove(userId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/friends?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' });
      await loadBoard();
    } catch { /* ignore — board stays as-is */ }
    finally { setBusy(false); }
  }

  const myRank     = myId ? rows.findIndex((r) => r.id === myId) + 1 : 0;
  const totalPicks = useUserStore((s) => s.user.totalPicks);

  return (
    <main className="min-h-screen pb-24 max-w-md mx-auto px-4 pt-4">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-ink">Rankings</h1>
        <p className="text-[11px] text-dim mt-0.5">
          {scope === 'friends' ? 'You vs the players you follow' : 'Top 50 by Elo rating'}
        </p>
      </div>

      {/* Global / Friends scope toggle */}
      <div className="flex bg-card border border-rim rounded-xl p-1 gap-1 mb-4">
        {([['global', '🌎 Global'], ['friends', '🤝 Friends']] as [Scope, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setScope(key); setAddMsg(''); }}
            className={`flex-1 py-2 rounded-lg text-xs font-black transition ${
              scope === key ? 'bg-violet-600 text-white' : 'text-dim hover:text-sub'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Add-friend form (friends scope) */}
      {scope === 'friends' && (
        <form onSubmit={handleAdd} className="mb-4">
          <div className="flex gap-2">
            <input
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              placeholder="Add a friend by username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 min-w-0 bg-card border border-rim rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-dim focus:border-accent/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !addInput.trim()}
              className="shrink-0 bg-violet-600 text-white font-black px-4 rounded-xl text-sm disabled:opacity-40 active:scale-95 transition"
            >
              Add
            </button>
          </div>
          {addMsg && <p className="text-[11px] text-sub mt-1.5 px-1">{addMsg}</p>}
        </form>
      )}

      {/* Not on the board yet — hook to make a first pick */}
      {!loading && !error && myRank === 0 && totalPicks === 0 && scope === 'global' && (
        <a
          href="/"
          className="mb-4 flex items-center gap-3 bg-accent/5 border border-accent/20 rounded-xl px-4 py-3 hover:border-accent/40 transition"
        >
          <span className="text-xl">🎯</span>
          <div className="flex-1">
            <p className="text-sm font-black text-ink">You&rsquo;re not on the board yet</p>
            <p className="text-[11px] text-dim mt-0.5">Make your first pick to enter the rankings.</p>
          </div>
          <span className="text-accent font-black">›</span>
        </a>
      )}

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
          <p className="text-4xl mb-3">{scope === 'friends' ? '🤝' : '🏆'}</p>
          <p className="font-bold text-ink mb-1">
            {scope === 'friends' ? 'No friends yet' : 'No rankings yet'}
          </p>
          <p className="text-sm text-dim">
            {scope === 'friends'
              ? 'Add players by username above to compare ratings head-to-head.'
              : 'Be the first to make picks and claim the top spot.'}
          </p>
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
                  <p className="text-[10px] text-dim">
                    {rankLabel(elo)} ·{' '}
                    <span className="text-emerald-400 font-bold">{row.wins}W</span>
                    <span className="mx-0.5">–</span>
                    <span className="text-red-400 font-bold">{row.losses}L</span>
                  </p>
                </div>

                {/* Streak */}
                {row.current_streak >= 3 && (
                  <span className="text-[10px] font-bold text-orange-400">{row.current_streak}🔥</span>
                )}

                {/* Elo + weekly trend */}
                <div className="text-right shrink-0">
                  <p className={`text-sm font-black tabular-nums ${isMe ? 'text-accent' : 'text-ink'}`}>
                    {elo?.toLocaleString() ?? '—'}
                  </p>
                  {row.weekly_delta !== 0 && (
                    <p className={`text-[10px] font-bold tabular-nums ${row.weekly_delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {row.weekly_delta > 0 ? '▲' : '▼'}{Math.abs(row.weekly_delta)} this week
                    </p>
                  )}
                </div>

                {/* Unfollow (friends scope, not yourself) */}
                {scope === 'friends' && !isMe && (
                  <button
                    onClick={() => handleRemove(row.id)}
                    disabled={busy}
                    aria-label={`Remove ${row.username}`}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-dim hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40"
                  >
                    ✕
                  </button>
                )}
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

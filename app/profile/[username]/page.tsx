import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase';
import Link from 'next/link';

function rankLabel(elo: number): { label: string; color: string } {
  if (elo >= 2000) return { label: 'Elite',        color: '#EF4444' };
  if (elo >= 1600) return { label: 'Expert',       color: '#F97316' };
  if (elo >= 1200) return { label: 'Advanced',     color: '#A78BFA' };
  if (elo >= 800)  return { label: 'Intermediate', color: '#94A3B8' };
  return                  { label: 'Rookie',       color: '#64748B' };
}

const SPORT_COLS = [
  { key: 'nba_elo',  label: 'NBA'  },
  { key: 'nfl_elo',  label: 'NFL'  },
  { key: 'mlb_elo',  label: 'MLB'  },
  { key: 'ncaa_elo', label: 'NCAA' },
] as const;

type Row = Record<string, unknown>;

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const admin = createAdminClient();

  const { data: u } = await admin
    .from('users')
    .select('id, username, global_elo, season_elo, nba_elo, nfl_elo, mlb_elo, ncaa_elo, total_picks, current_streak, weeks_active')
    .eq('username', username)
    .single();

  if (!u) notFound();

  // Recent resolved picks (last 10)
  const { data: recentPicks } = await admin
    .from('user_picks')
    .select('id, bet_type, pick_side, outcome, elo_delta, placed_at, sport, match_description')
    .eq('user_id', u.id)
    .in('outcome', ['win', 'loss', 'push'])
    .order('placed_at', { ascending: false })
    .limit(10);

  const picks   = recentPicks ?? [];
  const wins    = picks.filter((p: Row) => p.outcome === 'win').length;
  const losses  = picks.filter((p: Row) => p.outcome === 'loss').length;
  const winRate = picks.length > 0 ? Math.round((wins / picks.length) * 100) : null;
  const netElo  = picks.reduce((s: number, p: Row) => s + ((p.elo_delta as number) ?? 0), 0);

  const globalRank = rankLabel(u.global_elo as number);

  return (
    <main className="min-h-screen pb-10 max-w-md mx-auto px-4 pt-6">
      {/* Back */}
      <Link href="/leaderboard" className="flex items-center gap-1 text-sub hover:text-ink text-sm mb-5 transition">
        ‹ Rankings
      </Link>

      {/* Profile hero */}
      <div className="bg-card border border-rim rounded-2xl p-5 mb-4 flex items-center gap-4">
        {/* Avatar */}
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 border"
          style={{ backgroundColor: globalRank.color + '22', borderColor: globalRank.color + '44' }}
        >
          <span className="text-2xl font-black" style={{ color: globalRank.color }}>
            {(u.username as string)?.[0]?.toUpperCase() ?? '?'}
          </span>
        </div>

        <div className="min-w-0">
          <p className="font-black text-ink text-lg truncate">{u.username as string}</p>
          <p className="text-[11px] font-bold mt-0.5" style={{ color: globalRank.color }}>
            ◆ {globalRank.label}
          </p>
          <p className="text-[10px] text-dim mt-0.5">
            {u.total_picks as number} picks · {u.weeks_active as number} weeks active
          </p>
        </div>
      </div>

      {/* Elo stats */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-card border border-rim rounded-xl p-3 text-center">
          <p className="text-[10px] text-dim uppercase tracking-wide mb-1">Global Elo</p>
          <p className="text-2xl font-black text-ink tabular-nums">{(u.global_elo as number).toLocaleString()}</p>
        </div>
        <div className="bg-card border border-rim rounded-xl p-3 text-center">
          <p className="text-[10px] text-dim uppercase tracking-wide mb-1">Season Elo</p>
          <p className="text-2xl font-black text-ink tabular-nums">{(u.season_elo as number).toLocaleString()}</p>
        </div>
        {winRate !== null && (
          <div className="bg-card border border-rim rounded-xl p-3 text-center">
            <p className="text-[10px] text-dim uppercase tracking-wide mb-1">Win Rate</p>
            <p className="text-xl font-black text-ink">{winRate}%</p>
            <p className="text-[9px] text-dim">{wins}W–{losses}L recent</p>
          </div>
        )}
        <div className="bg-card border border-rim rounded-xl p-3 text-center">
          <p className="text-[10px] text-dim uppercase tracking-wide mb-1">Streak</p>
          <p className="text-xl font-black text-ink">
            {(u.current_streak as number) > 0 ? `${u.current_streak}🔥` : '—'}
          </p>
        </div>
      </div>

      {/* Sport Ratings */}
      <p className="text-[10px] text-dim uppercase tracking-widest font-bold mb-2">Sport Ratings</p>
      <div className="grid grid-cols-2 gap-2 mb-5">
        {SPORT_COLS.map(({ key, label }) => {
          const elo  = (u[key] as number) ?? 1200;
          const rank = rankLabel(elo);
          return (
            <div key={key} className="bg-card border border-rim rounded-xl px-3 py-2.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-dim font-black uppercase tracking-widest">{label}</p>
                <p className="text-sm font-black text-ink tabular-nums">{elo.toLocaleString()}</p>
              </div>
              <span className="text-[10px] font-bold" style={{ color: rank.color }}>{rank.label}</span>
            </div>
          );
        })}
      </div>

      {/* Recent picks */}
      {picks.length > 0 && (
        <>
          <p className="text-[10px] text-dim uppercase tracking-widest font-bold mb-2">Recent Results</p>
          <div className="flex flex-col gap-1.5">
            {picks.map((p: Row) => {
              const outcome  = p.outcome as string;
              const delta    = p.elo_delta as number | null;
              const outcomeColor =
                outcome === 'win'  ? 'text-emerald-400' :
                outcome === 'loss' ? 'text-red-400'     : 'text-sub';
              const badge =
                outcome === 'win'  ? 'WON'  :
                outcome === 'loss' ? 'LOST' : 'PUSH';

              return (
                <div key={p.id as string} className="bg-card border border-rim rounded-xl px-3 py-2.5 flex items-center gap-3">
                  <span className={`text-[10px] font-black w-10 shrink-0 ${outcomeColor}`}>{badge}</span>
                  <p className="flex-1 text-xs text-sub truncate">
                    {(p.sport as string) && <span className="text-accent/80 font-bold">{p.sport as string} · </span>}
                    {p.match_description as string}
                  </p>
                  {delta !== null && (
                    <span className={`text-xs font-black tabular-nums shrink-0 ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {delta >= 0 ? '+' : ''}{delta}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-dim text-center mt-3">
            Net Elo (last {picks.length}): <span className={netElo >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {netElo >= 0 ? '+' : ''}{netElo}
            </span>
          </p>
        </>
      )}
    </main>
  );
}

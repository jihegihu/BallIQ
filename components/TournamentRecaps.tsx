'use client';

import { UserPick } from '@/types';
import { TOURNAMENTS, pickTournament, isTournamentLive } from '@/lib/tournaments';

type Tally = { wins: number; losses: number; pushes: number; net: number; settled: number; pending: number };

export default function TournamentRecaps({ picks }: { picks: UserPick[] }) {
  const byId = new Map<string, Tally>();

  for (const p of picks) {
    const t = pickTournament(p);
    if (!t) continue;
    if (!byId.has(t.id)) byId.set(t.id, { wins: 0, losses: 0, pushes: 0, net: 0, settled: 0, pending: 0 });
    const tally = byId.get(t.id)!;

    if (p.outcome === 'pending')   { tally.pending++; continue; }
    if (p.outcome === 'cancelled' || p.outcome === 'void') continue;

    tally.settled++;
    tally.net += p.eloDelta ?? 0;
    if (p.outcome === 'win')  tally.wins++;
    else if (p.outcome === 'loss') tally.losses++;
    else if (p.outcome === 'push') tally.pushes++;
  }

  const recaps = TOURNAMENTS
    .map((t) => ({ t, tally: byId.get(t.id) }))
    .filter((x): x is { t: typeof x.t; tally: Tally } => !!x.tally && (x.tally.settled > 0 || x.tally.pending > 0));

  if (recaps.length === 0) return null;

  return (
    <div className="bg-card border border-rim rounded-xl p-3 mb-3">
      <p className="text-[10px] text-dim uppercase tracking-widest font-bold mb-2">Tournament Recaps</p>
      <div className="space-y-2">
        {recaps.map(({ t, tally }) => {
          const live = isTournamentLive(t);
          const rate = tally.settled > 0 ? Math.round((tally.wins / tally.settled) * 100) : null;
          return (
            <div key={t.id} className="flex items-center gap-3 bg-layer rounded-lg px-3 py-2.5">
              <span className="text-xl leading-none shrink-0">{t.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-black text-ink truncate">{t.name}</p>
                  {live && <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest shrink-0">● Live</span>}
                </div>
                <p className="text-[10px] text-dim">
                  {tally.settled > 0 ? (
                    <>
                      <span className="text-emerald-400 font-bold">{tally.wins}W</span>
                      <span className="mx-0.5">–</span>
                      <span className="text-red-400 font-bold">{tally.losses}L</span>
                      {tally.pushes > 0 && <span className="text-sub"> · {tally.pushes}P</span>}
                      {rate !== null && <span> · {rate}% win</span>}
                    </>
                  ) : (
                    <span>No settled picks yet</span>
                  )}
                  {tally.pending > 0 && <span className="text-accent"> · {tally.pending} pending</span>}
                </p>
              </div>
              {tally.settled > 0 && (
                <span className={`text-sm font-black tabular-nums shrink-0 ${tally.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {tally.net >= 0 ? '+' : ''}{tally.net}
                  <span className="text-[9px] text-dim font-bold ml-0.5">Elo</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

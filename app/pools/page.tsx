'use client';

// Head to Head — the pools you are in, the ones you have been invited to, and
// the way to start one.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useUserStore } from '@/lib/userStore';
import { potentialWin, POOL_STAKE } from '@/lib/pools';

type PoolRow = {
  id: string;
  sport: string;
  title: string;
  stake: number;
  phase: 'open' | 'live' | 'settled' | 'cancelled';
  locksAt: string;
  creatorName: string;
  joined: number;
  games: number;
  myStatus: 'invited' | 'joined';
  myPicks: number;
  myCorrect: number | null;
  myDelta: number | null;
};

type Eligible = { ok: boolean; settled: number; needed: number };

function when(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function PoolCard({ p }: { p: PoolRow }) {
  const invited = p.myStatus === 'invited';
  return (
    <Link
      href={`/pools/${p.id}`}
      className="block bg-card border border-rim rounded-2xl p-4 active:scale-[0.99] transition-transform"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-black text-ink text-sm truncate">{p.title}</p>
          <p className="text-[11px] text-dim mt-0.5 truncate">
            {invited ? `${p.creatorName} invited you` : `${p.joined} playing · ${p.games} games`}
          </p>
        </div>
        <Icon name="chevronRight" size={16} className="text-dim shrink-0 mt-0.5" />
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-rim text-[11px]">
        {p.phase === 'settled' ? (
          <>
            <span className="text-dim">{p.myCorrect ?? 0} correct</span>
            <span className={`font-black tabular-nums ${(p.myDelta ?? 0) > 0 ? 'text-good' : (p.myDelta ?? 0) < 0 ? 'text-bad' : 'text-dim'}`}>
              {(p.myDelta ?? 0) > 0 ? '+' : ''}{p.myDelta ?? 0} Elo
            </span>
          </>
        ) : p.phase === 'cancelled' ? (
          <span className="text-dim">Cancelled. No Elo moved.</span>
        ) : invited ? (
          <>
            <span className="text-dim">Locks {when(p.locksAt)}</span>
            <span className="font-black text-accent">{p.stake} Elo to enter</span>
          </>
        ) : (
          <>
            <span className="text-dim">
              {p.phase === 'live' ? 'In progress' : `Locks ${when(p.locksAt)}`} · {p.myPicks}/{p.games} picked
            </span>
            <span className="font-black text-accent tabular-nums">+{potentialWin(p.joined, p.stake)} to win</span>
          </>
        )}
      </div>
    </Link>
  );
}

function Section({ title, pools }: { title: string; pools: PoolRow[] }) {
  if (pools.length === 0) return null;
  return (
    <section className="mb-5">
      <p className="text-[10px] text-dim uppercase tracking-widest font-bold mb-2">{title}</p>
      <div className="space-y-2">{pools.map((p) => <PoolCard key={p.id} p={p} />)}</div>
    </section>
  );
}

export default function PoolsPage() {
  const refreshNonce = useUserStore((s) => s.refreshNonce);
  const [pools, setPools]       = useState<PoolRow[] | null>(null);
  const [eligible, setEligible] = useState<Eligible | null>(null);
  const [error, setError]       = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/pools', { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, data: await r.json() }))
      .then(({ ok, data }) => {
        if (!alive) return;
        // `hint` is only sent when the pool tables are missing. That is a setup
        // step, not something a player can act on, so say it plainly.
        if (!ok) { setError(data.hint ? 'Head to Head is being set up. Check back soon.' : (data.error ?? 'Could not load pools')); return; }
        setError('');
        setPools(data.pools ?? []);
        setEligible(data.eligible ?? null);
      })
      .catch(() => { if (alive) setError('Could not load pools'); });
    return () => { alive = false; };
  }, [refreshNonce]);

  const invites  = (pools ?? []).filter((p) => p.myStatus === 'invited');
  const active   = (pools ?? []).filter((p) => p.myStatus === 'joined' && (p.phase === 'open' || p.phase === 'live'));
  const finished = (pools ?? []).filter((p) => p.myStatus === 'joined' && (p.phase === 'settled' || p.phase === 'cancelled'));

  return (
    <main className="min-h-screen pb-28 max-w-md mx-auto px-4 pt-4">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-ink">Head to Head</h1>
        <p className="text-[11px] text-dim mt-0.5">
          Pick every game on a slate against your friends. Most correct takes the pot.
        </p>
      </div>

      {eligible && !eligible.ok && (
        <div className="bg-card border border-rim rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2">
            <Icon name="lock" size={14} className="text-dim" />
            <p className="text-sm font-bold text-ink">Unlocks at {eligible.needed} settled picks</p>
          </div>
          <p className="text-[11px] text-dim mt-1">
            You have {eligible.settled}. Pools are played for rating, so you need a track record first.
          </p>
          <div className="h-1.5 bg-layer rounded-full overflow-hidden mt-3">
            <div
              className="h-full bg-accent rounded-full"
              style={{ width: `${Math.min(100, (eligible.settled / eligible.needed) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {eligible?.ok && (
        <Link
          href="/pools/new"
          className="flex items-center justify-center gap-2 w-full bg-violet-600 text-white rounded-2xl py-3.5 text-sm font-black mb-5 active:scale-[0.98] transition-transform"
        >
          <Icon name="users" size={15} />Start a pool
        </Link>
      )}

      {error && (
        <div className="bg-card border border-rim rounded-2xl p-4 text-sm text-sub">{error}</div>
      )}

      {!error && pools === null && (
        <div className="space-y-2">
          {[0, 1].map((i) => <div key={i} className="h-24 bg-card border border-rim rounded-2xl animate-pulse" />)}
        </div>
      )}

      <Section title="Invitations" pools={invites} />
      <Section title="Your pools" pools={active} />
      <Section title="Finished" pools={finished} />

      {!error && pools !== null && pools.length === 0 && (
        <div className="bg-card border border-rim rounded-2xl p-5 text-center">
          <p className="text-sm font-bold text-ink">No pools yet</p>
          <p className="text-[11px] text-dim mt-1">
            Everyone puts up {POOL_STAKE} Elo. Whoever calls the most games right takes it all:
            six players means +{potentialWin(6)} for the winner.
          </p>
        </div>
      )}
    </main>
  );
}

'use client';

// Start a pool: choose the sport, the slate, and who to invite.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { POOL_STAKE, POOL_MAX_MEMBERS, potentialWin } from '@/lib/pools';
import { InviteButton } from '@/components/ShareButtons';

type Option = {
  key: string;
  nights: 1 | 2;
  label: string;
  locksAt: string;
  games: { id: string; home: string; away: string; at: string }[];
  taken: boolean;
};
type SportOptions = { sport: string; options: Option[] };
type Friend = { id: string; username: string; global_elo: number };

const SPORT_NAME: Record<string, string> = { NFL: 'NFL', EPL: 'Premier League', NBA: 'NBA' };

function when(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function NewPoolPage() {
  const router = useRouter();
  const [sports, setSports]   = useState<SportOptions[] | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sport, setSport]     = useState('NFL');
  const [chosen, setChosen]   = useState<string | null>(null);   // `${key}|${nights}`
  const [invite, setInvite]   = useState<Set<string>>(new Set());
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/pools/options', { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, data: await r.json() }))
      .then(({ ok, data }) => {
        if (!alive) return;
        if (!ok) { setError(data.error ?? 'Could not load slates'); setSports([]); return; }
        const list = (data.sports ?? []) as SportOptions[];
        setSports(list);
        setFriends(data.friends ?? []);
        // Open on the first sport that actually has something to play.
        const first = list.find((s) => s.options.some((o) => !o.taken));
        if (first) setSport(first.sport);
        if (data.eligible && !data.eligible.ok) {
          setError(`You need ${data.eligible.needed} settled picks to play head to head. You have ${data.eligible.settled}.`);
        }
      })
      .catch(() => { if (alive) { setError('Could not load slates'); setSports([]); } });
    return () => { alive = false; };
  }, []);

  const options = sports?.find((s) => s.sport === sport)?.options ?? [];
  const slate   = options.find((o) => `${o.key}|${o.nights}` === chosen) ?? null;
  const players = 1 + invite.size;

  function toggle(id: string) {
    setInvite((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function create() {
    if (!slate || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/pools', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sport, key: slate.key, nights: slate.nights, invite: [...invite] }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Could not create the pool'); setBusy(false); return; }
      router.push(`/pools/${data.id}`);
    } catch {
      setError('Network error. Try again.');
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen pb-28 max-w-md mx-auto px-4 pt-4">
      <Link href="/pools" className="inline-flex items-center gap-1 text-sub hover:text-ink text-sm">
        <Icon name="chevronLeft" size={15} />Back
      </Link>
      <h1 className="text-2xl font-black text-ink mt-3 mb-4">Start a pool</h1>

      {/* Sport */}
      <div className="flex bg-card border border-rim rounded-xl p-1 gap-1 mb-4">
        {(sports ?? []).map((s) => (
          <button
            key={s.sport}
            onClick={() => { setSport(s.sport); setChosen(null); }}
            className={`flex-1 py-2 rounded-lg text-xs font-black transition ${
              sport === s.sport ? 'bg-violet-600 text-white' : 'text-dim hover:text-sub'
            }`}
          >
            {SPORT_NAME[s.sport] ?? s.sport}
          </button>
        ))}
      </div>

      {/* Slate */}
      <p className="text-[10px] text-dim uppercase tracking-widest font-bold mb-2">Slate</p>
      {sports === null ? (
        <div className="h-20 bg-card border border-rim rounded-2xl animate-pulse mb-5" />
      ) : options.length === 0 ? (
        <div className="bg-card border border-rim rounded-2xl p-4 mb-5">
          <p className="text-sm font-bold text-ink">No {SPORT_NAME[sport] ?? sport} slate right now</p>
          <p className="text-[11px] text-dim mt-1">
            {sport === 'NBA'
              ? 'NBA games are listed about a day ahead. Check back on the morning of a night with five or more games.'
              : 'There are not enough upcoming games on the schedule yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 mb-5">
          {options.map((o) => {
            const id = `${o.key}|${o.nights}`;
            const on = chosen === id;
            return (
              <button
                key={id}
                disabled={o.taken}
                onClick={() => setChosen(id)}
                aria-pressed={on}
                className={`w-full text-left rounded-2xl p-4 border transition disabled:opacity-50 ${
                  on ? 'bg-accent/10 border-accent' : 'bg-card border-rim'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black text-ink text-sm">
                    {o.label}{o.nights === 2 && <span className="text-dim font-bold"> · 2 nights</span>}
                  </p>
                  <span className="text-[11px] font-bold text-sub shrink-0">{o.games.length} games</span>
                </div>
                <p className="text-[11px] text-dim mt-1">
                  {o.taken ? `You are already in a ${SPORT_NAME[sport] ?? sport} pool that week` : `Locks ${when(o.locksAt)}`}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Friends */}
      <p className="text-[10px] text-dim uppercase tracking-widest font-bold mb-2">Invite</p>
      {friends.length === 0 ? (
        <div className="bg-card border border-rim rounded-2xl p-4 mb-5">
          <p className="text-sm font-bold text-ink">Nobody to invite yet</p>
          <p className="text-[11px] text-dim mt-1">
            Add friends by username under Ranks, then Friends. You can still start the pool and invite them after.
          </p>
          <InviteButton className="w-full mt-3" />
        </div>
      ) : (
        <div className="bg-card border border-rim rounded-2xl mb-5 divide-y divide-rim">
          {friends.map((f) => {
            const on = invite.has(f.id);
            const full = !on && players >= POOL_MAX_MEMBERS;
            return (
              <button
                key={f.id}
                disabled={full}
                onClick={() => toggle(f.id)}
                aria-pressed={on}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left disabled:opacity-40"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink truncate">{f.username}</span>
                  <span className="block text-[10px] text-dim tabular-nums">{f.global_elo.toLocaleString()} Elo</span>
                </span>
                <span
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                    on ? 'bg-accent border-accent' : 'border-rim'
                  }`}
                >
                  {on && <Icon name="check" size={12} strokeWidth={3} className="text-white" />}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Stakes, stated before the button rather than after it */}
      <div className="bg-card border border-rim rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-sub">Everyone stakes</span>
          <span className="font-black text-ink tabular-nums">{POOL_STAKE} Elo</span>
        </div>
        <div className="flex items-center justify-between text-sm mt-2">
          <span className="text-sub">Winner takes, if all {players} play</span>
          <span className="font-black text-good tabular-nums">+{potentialWin(players)} Elo</span>
        </div>
        <p className="text-[11px] text-dim mt-3">
          Most correct picks wins. Ties split the pot. A game you skip counts as a miss.
        </p>
      </div>

      {error && <p className="text-sm text-bad mb-3">{error}</p>}

      <button
        onClick={create}
        disabled={!slate || busy}
        className="w-full bg-violet-600 text-white rounded-2xl py-3.5 text-sm font-black disabled:opacity-40 active:scale-[0.98] transition-transform"
      >
        {busy ? 'Creating…' : 'Create pool'}
      </button>
    </main>
  );
}

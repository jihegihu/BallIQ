'use client';

// One pool: the slate to pick, the standings, and joining or leaving.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import TeamAvatar from '@/components/TeamAvatar';
import CreatorBadge from '@/components/CreatorBadge';
import { hapticImpact } from '@/lib/haptics';
import { ShareCardButton } from '@/components/ShareButtons';

type Side = 'home' | 'away' | 'draw';

type Game = {
  id: string;
  home: string;
  away: string;
  at: string;
  started: boolean;
  homeScore: number | null;
  awayScore: number | null;
  result: Side | null;
  myPick: Side | null;
  others: { userId: string; side: Side }[] | null;
};

type Member = {
  userId: string;
  username: string;
  status: 'joined' | 'invited';
  picksMade: number;
  correct: number;
  eloDelta: number | null;
};

type Detail = {
  pool: {
    id: string; sport: string; title: string; stake: number;
    phase: 'open' | 'live' | 'settled' | 'cancelled';
    locksAt: string; allowsDraw: boolean; decided: number;
  };
  me: { id: string; status: 'invited' | 'joined' | 'declined'; isCreator: boolean };
  joined: number;
  potentialWin: number;
  matches: Game[];
  members: Member[];
};

type Friend = { id: string; username: string };

function when(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

const PHASE_LABEL: Record<Detail['pool']['phase'], string> = {
  open: 'Open', live: 'In progress', settled: 'Final', cancelled: 'Cancelled',
};

export default function PoolPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData]       = useState<Detail | null>(null);
  const [error, setError]     = useState('');
  const [notice, setNotice]   = useState('');
  const [busy, setBusy]       = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/pools/${id}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? 'Could not load this pool'); return; }
      setError('');
      setData(body as Detail);
    } catch {
      setError('Could not load this pool');
    }
  }, [id]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/pools/${id}`, { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!alive) return;
        if (!ok) setError(body.error ?? 'Could not load this pool');
        else setData(body as Detail);
      })
      .catch(() => { if (alive) setError('Could not load this pool'); });
    // The creator can invite more people while the pool is open.
    fetch('/api/friends')
      .then((r) => r.json())
      .then((d) => { if (alive) setFriends(d.friends ?? []); })
      .catch(() => { /* inviting is optional */ });
    return () => { alive = false; };
  }, [id]);

  async function act(action: string, extra: Record<string, unknown> = {}): Promise<boolean> {
    setBusy(true);
    setNotice('');
    try {
      const res  = await fetch(`/api/pools/${id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, ...extra }),
      });
      const body = await res.json();
      if (!res.ok) { setNotice(body.error ?? 'Something went wrong'); return false; }
      return true;
    } catch {
      setNotice('Network error. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function pick(game: Game, side: Side) {
    if (!data || game.started || game.myPick === side) return;
    hapticImpact('light');
    // Show the pick at once; put it back if the server refuses it.
    const before = game.myPick;
    const paint = (s: Side | null) =>
      setData((d) => d && { ...d, matches: d.matches.map((m) => (m.id === game.id ? { ...m, myPick: s } : m)) });
    paint(side);
    const ok = await act('pick', { matchId: game.id, side });
    if (!ok) paint(before);
  }

  if (error) {
    return (
      <main className="min-h-screen pb-28 max-w-md mx-auto px-4 pt-4">
        <Link href="/pools" className="tap inline-flex items-center gap-1 text-sub hover:text-ink text-sm">
          <Icon name="chevronLeft" size={15} />Back
        </Link>
        <div className="bg-card border border-rim rounded-2xl p-4 mt-4 text-sm text-sub">{error}</div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen pb-28 max-w-md mx-auto px-4 pt-4">
        <div className="h-8 w-40 bg-card rounded-lg animate-pulse mb-4" />
        <div className="h-28 bg-card border border-rim rounded-2xl animate-pulse" />
      </main>
    );
  }

  const { pool, me, matches, members } = data;
  const open    = pool.phase === 'open';
  const playing = me.status === 'joined';
  const picked  = matches.filter((m) => m.myPick).length;
  const names   = new Map(members.map((m) => [m.userId, m.username]));
  const memberIds = new Set(members.map((m) => m.userId));
  const invitable = friends.filter((f) => !memberIds.has(f.id));
  const best = Math.max(0, ...members.filter((m) => m.status === 'joined').map((m) => m.correct));

  return (
    <main className="min-h-screen pb-28 max-w-md mx-auto px-4 pt-4">
      <Link href="/pools" className="tap inline-flex items-center gap-1 text-sub hover:text-ink text-sm">
        <Icon name="chevronLeft" size={15} />Back
      </Link>

      <div className="flex items-start justify-between gap-3 mt-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-black text-ink truncate">{pool.title}</h1>
          <p className="text-[11px] text-dim mt-0.5">
            {open ? `Locks ${when(pool.locksAt)}` : PHASE_LABEL[pool.phase]}
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-lg bg-layer text-sub">
          {PHASE_LABEL[pool.phase]}
        </span>
      </div>

      {/* The pot */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          ['Playing', String(data.joined)],
          ['Stake', `${pool.stake} Elo`],
          ['Winner takes', `+${data.potentialWin}`],
        ].map(([label, value]) => (
          <div key={label} className="bg-card border border-rim rounded-xl p-3">
            <p className="text-[10px] text-dim uppercase tracking-wide mb-1">{label}</p>
            <p className="text-base font-black text-ink tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {pool.phase === 'cancelled' && (
        <div className="bg-card border border-rim rounded-2xl p-4 mb-4 text-sm text-sub">
          This pool was cancelled. No Elo moved.
        </div>
      )}

      {/* Invitation */}
      {me.status === 'invited' && open && (
        <div className="bg-card border border-accent/40 rounded-2xl p-4 mb-4">
          <p className="text-sm font-bold text-ink">You are invited</p>
          <p className="text-[11px] text-dim mt-1">
            Joining stakes {pool.stake} Elo. Most correct picks takes the pot; ties split it.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              disabled={busy}
              onClick={async () => { if (await act('join')) await load(); }}
              className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-black disabled:opacity-40 active:scale-[0.98] transition-transform"
            >
              Join for {pool.stake} Elo
            </button>
            <button
              disabled={busy}
              onClick={async () => { if (await act('decline')) router.push('/pools'); }}
              className="px-4 bg-layer text-sub rounded-xl py-2.5 text-sm font-bold disabled:opacity-40"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {notice && <p className="text-sm text-bad mb-3">{notice}</p>}

      {/* Slate */}
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[10px] text-dim uppercase tracking-widest font-bold">Games</p>
        {playing && <p className="text-[11px] text-dim tabular-nums">{picked}/{matches.length} picked</p>}
      </div>
      <div className="space-y-2 mb-5">
        {matches.map((g) => {
          const sides: [Side, string][] = pool.allowsDraw
            ? [['away', g.away], ['draw', 'Draw'], ['home', g.home]]
            : [['away', g.away], ['home', g.home]];
          return (
            <div key={g.id} className="bg-card border border-rim rounded-2xl p-3">
              <div className="flex items-center justify-between text-[10px] text-dim mb-2">
                <span>{when(g.at)}</span>
                {g.homeScore != null && g.awayScore != null
                  ? <span className="font-bold text-sub tabular-nums">{g.awayScore}–{g.homeScore}{g.result ? ' · Final' : ''}</span>
                  : g.started ? <span>Started</span> : null}
              </div>
              <div className="flex gap-2">
                {sides.map(([side, label]) => {
                  const mine = g.myPick === side;
                  const won  = g.result === side;
                  const lost = mine && g.result != null && !won;
                  const backers = g.others?.filter((o) => o.side === side) ?? [];
                  return (
                    <button
                      key={side}
                      disabled={!playing || g.started || busy}
                      onClick={() => pick(g, side)}
                      aria-pressed={mine}
                      className={`flex-1 min-w-0 rounded-xl border px-2 py-2.5 text-center transition disabled:cursor-default ${
                        mine && won  ? 'bg-good/15 border-good' :
                        lost         ? 'bg-bad/10 border-bad/60' :
                        mine         ? 'bg-pick/15 border-pick' :
                        won          ? 'border-good/50 bg-layer' :
                                       'bg-layer border-transparent'
                      }`}
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        {side !== 'draw' && <TeamAvatar teamName={label} size="xs" />}
                        <span className="text-xs font-black text-ink truncate">{label}</span>
                        {mine && <Icon name={lost ? 'close' : 'check'} size={12} strokeWidth={3} className={lost ? 'text-bad' : won ? 'text-good' : 'text-pick'} />}
                      </span>
                      {/* Who else is on this side, shown only once the game has started */}
                      {backers.length > 0 && (
                        <span className="block text-[9px] text-dim mt-1 truncate">
                          {backers.map((b) => names.get(b.userId) ?? 'Player').join(', ')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Standings */}
      <p className="text-[10px] text-dim uppercase tracking-widest font-bold mb-2">Standings</p>
      <div className="bg-card border border-rim rounded-2xl divide-y divide-rim mb-5">
        {members.map((m) => {
          const joined = m.status === 'joined';
          const leading = joined && pool.decided > 0 && m.correct === best;
          return (
            <div key={m.userId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className={`flex items-center gap-1.5 text-sm font-bold ${m.userId === me.id ? 'text-accent' : 'text-ink'}`}>
                  <span className="truncate">{m.username}</span>
                  <CreatorBadge userId={m.userId} />
                  {leading && <Icon name="trophy" size={12} className="text-accent shrink-0" />}
                </p>
                <p className="text-[10px] text-dim">
                  {joined ? `${m.picksMade}/${matches.length} picked` : 'Invited'}
                </p>
              </div>
              {joined && (
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-ink tabular-nums">{m.correct} correct</p>
                  {pool.phase === 'settled' && m.eloDelta != null && (
                    <p className={`text-[11px] font-black tabular-nums ${m.eloDelta > 0 ? 'text-good' : m.eloDelta < 0 ? 'text-bad' : 'text-dim'}`}>
                      {m.eloDelta > 0 ? '+' : ''}{m.eloDelta} Elo
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pool.phase === 'settled' && playing && (
        <ShareCardButton
          card={`/api/share/card?kind=pool&id=${pool.id}`}
          kind="pool"
          text={`${pool.title} on BallIQ.`}
          label="Share result"
          className="w-full mb-5"
        />
      )}

      {/* Creator: invite more, while it is still open */}
      {me.isCreator && open && invitable.length > 0 && (
        <>
          <p className="text-[10px] text-dim uppercase tracking-widest font-bold mb-2">Invite more</p>
          <div className="bg-card border border-rim rounded-2xl divide-y divide-rim mb-5">
            {invitable.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm font-bold text-ink truncate">{f.username}</span>
                <button
                  disabled={busy}
                  onClick={async () => { if (await act('invite', { userIds: [f.id] })) await load(); }}
                  className="tap text-xs font-black text-accent disabled:opacity-40"
                >
                  Invite
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Way out, only before the first game starts */}
      {open && playing && (
        <button
          disabled={busy}
          onClick={async () => {
            if (await act(me.isCreator ? 'cancel' : 'leave')) router.push('/pools');
          }}
          className="w-full bg-card border border-red-500/20 rounded-2xl py-3 text-sm font-bold text-bad disabled:opacity-40"
        >
          {me.isCreator ? 'Cancel pool' : 'Leave pool'}
        </button>
      )}
    </main>
  );
}

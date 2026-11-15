'use client';

// Product numbers, for the creator only. The API refuses everyone else, so
// for any other account this page just says there is nothing here.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { StatStrip } from '@/components/StatPieces';

type Stats = {
  generatedAt: string;
  eventsReady: boolean;
  totals: { accounts: number; withAPick: number; activeToday: number; active7d: number };
  daily: { day: string; signups: number; active: number }[];
  newAccounts: { count: number; picked1: number; picked1Pct: number | null; picked3: number; picked3Pct: number | null };
  retention: {
    nextDay: { of: number; n: number; pct: number | null };
    week:    { of: number; n: number; pct: number | null };
  };
  funnel: { label: string; n: number }[];
  skippedPickStep: number;
  sharing: { inviteShared: number; inviteAccepted: number; cardShared: number };
  pools: Record<string, number> | null;
};

function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const show = (p: number | null) => (p === null ? '—' : `${p}%`);

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-rim rounded-2xl p-4 mb-4">
      <p className="text-[10px] text-dim uppercase tracking-widest font-bold">{title}</p>
      {note && <p className="text-[11px] text-dim mt-1 mb-1">{note}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-sub">{label}</span>
      <span className="text-right">
        <span className="font-black text-ink tabular-nums">{value}</span>
        {sub && <span className="text-[11px] text-dim tabular-nums ml-1.5">{sub}</span>}
      </span>
    </div>
  );
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/stats', { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!alive) return;
        if (ok) setStats(body as Stats);
        else setError('Nothing here.');
      })
      .catch(() => { if (alive) setError('Could not load.'); });
    return () => { alive = false; };
  }, []);

  const top = stats?.funnel[0]?.n ?? 0;

  return (
    <main className="min-h-screen pb-28 max-w-md mx-auto px-4 pt-4">
      <Link href="/account" className="tap inline-flex items-center gap-1 text-sub hover:text-ink text-sm">
        <Icon name="chevronLeft" size={15} />Back
      </Link>
      <h1 className="text-2xl font-black text-ink mt-3">Stats</h1>
      <p className="text-[11px] text-dim mt-0.5 mb-4">Only you can see this. Days are US Eastern.</p>

      {error && <div className="bg-card border border-rim rounded-2xl p-4 text-sm text-sub">{error}</div>}
      {!error && !stats && <div className="h-40 bg-card border border-rim rounded-2xl animate-pulse" />}

      {stats && (
        <>
          <div className="mb-4">
            <StatStrip items={[
              { label: 'Accounts', value: String(stats.totals.accounts), sub: `${stats.totals.withAPick} have picked` },
              { label: 'Active today', value: String(stats.totals.activeToday), sub: `${stats.totals.active7d} in 7 days` },
            ]} />
          </div>

          <Card title="New accounts, last 30 days" note="Did they start playing after signing up?">
            <Row label="Signed up" value={String(stats.newAccounts.count)} />
            <Row label="Made a pick" value={show(stats.newAccounts.picked1Pct)} sub={`${stats.newAccounts.picked1}`} />
            <Row label="Made 3 or more" value={show(stats.newAccounts.picked3Pct)} sub={`${stats.newAccounts.picked3}`} />
          </Card>

          <Card title="Coming back" note="Only accounts old enough to have had the chance are counted.">
            <Row label="Back the next day" value={show(stats.retention.nextDay.pct)} sub={`${stats.retention.nextDay.n} of ${stats.retention.nextDay.of}`} />
            <Row label="Back within a week" value={show(stats.retention.week.pct)} sub={`${stats.retention.week.n} of ${stats.retention.week.of}`} />
          </Card>

          <Card
            title="Onboarding, last 30 days"
            note={stats.eventsReady
              ? 'People who reached each step. Counts start from the day tracking was switched on.'
              : 'Not recording yet: run supabase/migration-010-events.sql.'}
          >
            {stats.eventsReady && stats.funnel.map((f) => (
              <Row key={f.label} label={f.label} value={String(f.n)} sub={top > 0 ? `${Math.round((f.n / top) * 100)}%` : undefined} />
            ))}
            {stats.eventsReady && <Row label="Skipped the picks" value={String(stats.skippedPickStep)} />}
          </Card>

          <Card title="Sharing, last 30 days">
            <Row label="Invite links shared" value={String(stats.sharing.inviteShared)} />
            <Row label="Invites accepted" value={String(stats.sharing.inviteAccepted)} />
            <Row label="Cards shared" value={String(stats.sharing.cardShared)} />
          </Card>

          <Card title="Head to head">
            {stats.pools === null
              ? <p className="text-sm text-sub">Not set up yet: run supabase/migration-009-pools.sql.</p>
              : Object.keys(stats.pools).length === 0
                ? <p className="text-sm text-sub">No pools yet.</p>
                : Object.entries(stats.pools).map(([status, n]) => (
                    <Row key={status} label={status[0].toUpperCase() + status.slice(1)} value={String(n)} />
                  ))}
          </Card>

          <Card title="Last 14 days">
            <div className="flex justify-between text-[10px] text-dim uppercase tracking-wide pb-1 border-b border-rim">
              <span>Day</span><span>Signups · Active</span>
            </div>
            {[...stats.daily].reverse().map((d) => (
              <div key={d.day} className="flex justify-between py-1.5 text-sm">
                <span className="text-sub">{shortDay(d.day)}</span>
                <span className="font-black text-ink tabular-nums">{d.signups} · {d.active}</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </main>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useUser, useClerk } from '@clerk/nextjs';
import { useUserStore } from '@/lib/userStore';
import { useThemeStore } from '@/lib/themeStore';
import { useOnboardingStore } from '@/lib/onboardingStore';

function eloRankLabel(elo: number) {
  if (elo >= 2000) return 'Elite';
  if (elo >= 1600) return 'Expert';
  if (elo >= 1200) return 'Advanced';
  if (elo >= 800)  return 'Intermediate';
  return 'Rookie';
}

export default function AccountPage() {
  const { user: clerkUser, isLoaded } = useUser();
  const { signOut }                   = useClerk();
  const user                          = useUserStore((s) => s.user);
  const { theme, setTheme }           = useThemeStore();
  const openOnboarding                = useOnboardingStore((s) => s.open);

  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [delErr, setDelErr]         = useState('');

  async function handleDeleteAccount() {
    setDeleting(true);
    setDelErr('');
    try {
      const res = await fetch('/api/account', { method: 'DELETE' });
      if (res.ok) {
        await signOut({ redirectUrl: '/sign-in' });
      } else {
        const data = await res.json().catch(() => ({}));
        setDelErr(data.reason ?? 'Could not delete account. Please try again.');
        setDeleting(false);
      }
    } catch {
      setDelErr('Network error. Please try again.');
      setDeleting(false);
    }
  }

  const resolved   = user.picks.filter((p) => p.outcome !== 'pending' && p.outcome !== 'cancelled');
  const wins       = resolved.filter((p) => p.outcome === 'win').length;
  const losses     = resolved.filter((p) => p.outcome === 'loss').length;
  const winRate    = resolved.length > 0 ? Math.round((wins / resolved.length) * 100) : null;
  const netElo     = resolved.reduce((sum, p) => sum + (p.eloDelta ?? 0), 0);

  if (!isLoaded) {
    return <div className="min-h-screen bg-base" />;
  }

  const rawName   = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ');
  const username  = clerkUser?.username ?? (rawName || clerkUser?.emailAddresses?.[0]?.emailAddress?.split('@')[0]) ?? 'Player';
  const email     = clerkUser?.emailAddresses?.[0]?.emailAddress;
  const joinDate  = clerkUser?.createdAt
    ? new Date(clerkUser.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return (
    <main className="min-h-screen pb-24 max-w-md mx-auto px-4 pt-6">
      <h1 className="text-2xl font-black text-ink mb-6">Account</h1>

      {/* ── Profile ──────────────────────────────────────────────── */}
      <div className="bg-card border border-rim rounded-2xl p-5 mb-5 flex items-center gap-4">
        {clerkUser?.imageUrl ? (
          <img
            src={clerkUser.imageUrl}
            alt="avatar"
            className="w-14 h-14 rounded-full object-cover shrink-0 border border-rim"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
            <span className="text-2xl font-black text-accent">{username[0]?.toUpperCase()}</span>
          </div>
        )}
        <div className="min-w-0">
          <p className="font-black text-ink text-base truncate">{username}</p>
          {email && <p className="text-[11px] text-dim truncate mt-0.5">{email}</p>}
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-accent text-[9px]">◆</span>
            <span className="text-sm font-black text-accent tabular-nums">{user.globalElo.toLocaleString()}</span>
            <span className="text-dim text-[10px]">·</span>
            <span className="text-[10px] text-sub font-bold">{eloRankLabel(user.globalElo)}</span>
          </div>
          {joinDate && <p className="text-[10px] text-dim mt-0.5">Member since {joinDate}</p>}
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────────────── */}
      <p className="text-[10px] text-dim uppercase tracking-widest font-bold mb-2">Stats</p>
      <div className="grid grid-cols-2 gap-2 mb-5">
        <div className="bg-card border border-rim rounded-xl p-3">
          <p className="text-[10px] text-dim uppercase tracking-wide mb-1">Record</p>
          <p className="text-lg font-black">
            <span className="text-emerald-400">{wins}W</span>
            <span className="text-dim mx-1">–</span>
            <span className="text-red-400">{losses}L</span>
          </p>
        </div>
        <div className="bg-card border border-rim rounded-xl p-3">
          <p className="text-[10px] text-dim uppercase tracking-wide mb-1">Net Elo</p>
          <p className={`text-lg font-black ${netElo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {netElo >= 0 ? '+' : ''}{netElo}
          </p>
        </div>
        <div className="bg-card border border-rim rounded-xl p-3">
          <p className="text-[10px] text-dim uppercase tracking-wide mb-1">Total Picks</p>
          <p className="text-lg font-black text-ink">{user.totalPicks}</p>
        </div>
        <div className="bg-card border border-rim rounded-xl p-3">
          <p className="text-[10px] text-dim uppercase tracking-wide mb-1">Win Rate</p>
          <p className="text-lg font-black text-ink">{winRate !== null ? `${winRate}%` : '—'}</p>
        </div>
      </div>

      {/* ── Preferences ──────────────────────────────────────────── */}
      <p className="text-[10px] text-dim uppercase tracking-widest font-bold mb-2">Preferences</p>
      <div className="bg-card border border-rim rounded-2xl p-4 mb-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-ink">Theme</p>
            <p className="text-[11px] text-dim mt-0.5">{theme === 'dark' ? 'Dark' : 'Light'} mode active</p>
          </div>
          <div className="flex bg-layer rounded-xl p-1 gap-1 shrink-0">
            {(['dark', 'light'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                  theme === t
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-dim hover:text-sub'
                }`}
              >
                {t === 'dark' ? '🌙 Dark' : '☀️ Light'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Replay tutorial ─────────────────────────────────────── */}
      <div className="bg-card border border-rim rounded-2xl p-4 mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-ink">How BallIQ Works</p>
          <p className="text-[11px] text-dim mt-0.5">Replay the welcome walkthrough</p>
        </div>
        <button
          onClick={openOnboarding}
          className="px-3 py-1.5 rounded-xl border border-rim text-xs font-black text-sub hover:border-accent/40 hover:text-accent transition"
        >
          Replay →
        </button>
      </div>

      {/* ── About ────────────────────────────────────────────────── */}
      <p className="text-[10px] text-dim uppercase tracking-widest font-bold mb-2">About</p>
      <div className="bg-card border border-rim rounded-2xl overflow-hidden mb-5">
        <HowItWorks />
        <Link href="/privacy" className="flex items-center justify-between px-4 py-3 border-t border-rim">
          <p className="text-sm text-sub">Privacy Policy</p>
          <span className="text-dim text-xs">›</span>
        </Link>
        <Link href="/terms" className="flex items-center justify-between px-4 py-3 border-t border-rim">
          <p className="text-sm text-sub">Terms of Use</p>
          <span className="text-dim text-xs">›</span>
        </Link>
        <div className="flex items-center justify-between px-4 py-3 border-t border-rim">
          <p className="text-sm text-sub">Version</p>
          <p className="text-sm font-bold text-dim">0.1.0 (Beta)</p>
        </div>
      </div>

      {/* ── Sign out ─────────────────────────────────────────────── */}
      <button
        onClick={() => signOut({ redirectUrl: '/sign-in' })}
        className="w-full bg-card border border-red-500/20 rounded-2xl py-4 text-sm font-bold text-red-400 hover:bg-red-500/5 active:scale-[0.98] transition-all"
      >
        Sign Out
      </button>

      {/* ── Danger zone: delete account (App Store requirement) ───── */}
      <div className="mt-3">
        {!confirmDel ? (
          <button
            onClick={() => setConfirmDel(true)}
            className="w-full text-[11px] font-bold text-dim hover:text-red-400 py-2 transition"
          >
            Delete account
          </button>
        ) : (
          <div className="bg-card border border-red-500/30 rounded-2xl p-4">
            <p className="text-sm font-black text-ink mb-1">Delete your account?</p>
            <p className="text-[11px] text-dim mb-3">
              This permanently erases your profile, ratings, picks, and friends. It can&apos;t be undone.
            </p>
            {delErr && <p className="text-[11px] text-red-400 mb-2">{delErr}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setConfirmDel(false); setDelErr(''); }}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-rim text-sm font-bold text-sub disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500/90 text-white text-sm font-black disabled:opacity-50 active:scale-95 transition"
              >
                {deleting ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ── Expandable "How it works" section ────────────────────────────────────────

function HowItWorks() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        className="w-full flex items-center justify-between px-4 py-3"
        onClick={() => setOpen((o) => !o)}
      >
        <p className="text-sm font-bold text-ink">How BallIQ Works</p>
        <span className={`text-dim text-xs transition-transform duration-200 inline-block ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-rim pt-3 space-y-3">
          <Item
            title="Elo starts at 1,200"
            body="Every new player starts at 1,200 — the chess standard. Beat the odds, rise. Lose, drop. The market sets the baseline, you beat it."
          />
          <Item
            title="Odds set the difficulty"
            body="Picking a heavy favorite (+500 Elo) earns little on a win but costs a lot on a loss. Upsets flip that — more risk, more reward."
          />
          <Item
            title="Three ways to predict"
            body="Moneyline (who wins), Spread (win by enough), Over/Under (total points). Each has its own Elo calculation."
          />
          <Item
            title="Sport Ratings"
            body="You have a separate Elo for each sport. Dominate the NBA but struggle with the NFL? Your ratings reflect that."
          />
          <Item
            title="No real money — ever"
            body="BallIQ is a skill-tracking game, not a gambling platform. There are no deposits, withdrawals, wagers, or cash prizes — ever."
          />
        </div>
      )}
    </div>
  );
}

function Item({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-xs font-black text-ink mb-0.5">{title}</p>
      <p className="text-xs text-sub leading-relaxed">{body}</p>
    </div>
  );
}

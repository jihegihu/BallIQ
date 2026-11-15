// The page a friend lands on when they open an invite link. Public: the whole
// point is that the visitor has no account yet.
//
// It remembers who invited them (InviteRemember), so that if they sign up in
// this browser the two are made friends automatically. That memory lives in
// this browser only. Someone who installs the iPhone app instead starts with
// a clean slate there, which is why the page also says, in words, who to add.

import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase';
import TierLabel from '@/components/TierLabel';
import Icon from '@/components/Icon';
import InviteRemember from '@/components/InviteRemember';
import { APP_STORE_URL, UUID_RE } from '@/lib/invite';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'You are invited · BallIQ' };

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  type Inviter = { id: string; username: string; global_elo: number };
  let inviter: Inviter | null = null;
  if (UUID_RE.test(id)) {
    const admin = createAdminClient();
    const { data } = await admin.from('users').select('id, username, global_elo').eq('id', id).maybeSingle();
    if (data) inviter = data as Inviter;
  }

  return (
    <main className="min-h-screen max-w-md mx-auto px-5 py-10 flex flex-col justify-center">
      <div className="flex justify-center mb-4">
        <Icon name="diamond" size={44} strokeWidth={1.5} className="text-accent" />
      </div>

      {inviter ? (
        <>
          <InviteRemember inviterId={inviter.id} />
          <h1 className="text-2xl font-black text-ink text-center">
            {inviter.username} invited you to BallIQ
          </h1>
          <p className="text-center mt-2 text-sm">
            <span className="font-black text-ink tabular-nums">{inviter.global_elo.toLocaleString()} Elo</span>
            <span className="text-dim mx-1.5">·</span>
            <TierLabel elo={inviter.global_elo} className="font-bold" />
          </p>
        </>
      ) : (
        <h1 className="text-2xl font-black text-ink text-center">Welcome to BallIQ</h1>
      )}

      <p className="text-sm text-sub text-center leading-relaxed mt-4">
        Pick the winners of real games and build a rating, like chess.
        Play your friends head to head. No money, ever.
      </p>

      <div className="mt-6 space-y-2">
        <a
          href={APP_STORE_URL}
          className="flex items-center justify-center w-full bg-primary text-white rounded-2xl py-3.5 text-sm font-black active:scale-[0.98] transition-transform"
        >
          Get the iPhone app
        </a>
        <Link
          href="/sign-up"
          className="flex items-center justify-center w-full bg-card border border-rim text-ink rounded-2xl py-3.5 text-sm font-black"
        >
          Play in your browser
        </Link>
      </div>

      {inviter && (
        <p className="text-[11px] text-dim text-center leading-relaxed mt-5">
          Using the app? Once you are in, open Ranks, then Friends, and add{' '}
          <span className="font-black text-sub">{inviter.username}</span>.
          If you sign up in this browser, you are connected automatically.
        </p>
      )}
    </main>
  );
}

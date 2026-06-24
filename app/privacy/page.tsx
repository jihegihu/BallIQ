import Link from 'next/link';

export const metadata = { title: 'Privacy Policy · BallIQ' };

// NOTE: This is a starting template, not legal advice. Before submitting to the
// app stores, have it reviewed and replace the [bracketed] placeholders.
export default function PrivacyPage() {
  return (
    <main className="min-h-screen max-w-md mx-auto px-5 pt-6 pb-24">
      <Link href="/account" className="text-sub hover:text-ink text-sm">‹ Back</Link>
      <h1 className="text-2xl font-black text-ink mt-3 mb-1">Privacy Policy</h1>
      <p className="text-[11px] text-dim mb-6">Last updated: June 2026</p>

      <div className="space-y-5 text-sm text-sub leading-relaxed">
        <Section title="The short version">
          BallIQ is a free, skill-based sports-prediction game. There is no real-money
          wagering, no deposits or withdrawals, and no cash prizes. We collect only what we
          need to run your account and the game.
        </Section>

        <Section title="What we collect">
          <ul className="list-disc pl-4 space-y-1">
            <li><b className="text-ink">Account info</b> — your name, username, and email address, handled by our authentication provider (Clerk).</li>
            <li><b className="text-ink">Gameplay data</b> — the picks you make, your Elo ratings, streaks, and friends you add.</li>
            <li><b className="text-ink">Basic technical data</b> — standard logs your browser/app sends (e.g. device type), used to keep the service running and secure.</li>
          </ul>
        </Section>

        <Section title="How we use it">
          To run your account, calculate and display your ratings, power leaderboards and the
          friends feature, and keep the service working. We do not sell your personal data.
        </Section>

        <Section title="Who we share it with">
          We use trusted service providers that process data on our behalf: <b className="text-ink">Clerk</b> (sign-in),
          <b className="text-ink"> Supabase</b> (database), and <b className="text-ink">Vercel</b> (hosting). Sports
          odds and scores come from a third-party data provider (The Odds API); we send no
          personal data to them.
        </Section>

        <Section title="Deleting your data">
          You can permanently delete your account at any time from <b className="text-ink">Account → Delete account</b>.
          This erases your profile, ratings, picks, and friends. You can also email us to
          request deletion.
        </Section>

        <Section title="Children">
          BallIQ is not directed to children under 13, and we do not knowingly collect data
          from them.
        </Section>

        <Section title="Changes">
          We may update this policy; material changes will be reflected by the “last updated”
          date above.
        </Section>

        <Section title="Contact">
          Questions about privacy? Email <b className="text-ink">[support@yourdomain.com]</b>.
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-black text-ink mb-1.5">{title}</h2>
      {children}
    </section>
  );
}

import Link from 'next/link';

export const metadata = { title: 'Terms of Use · BallIQ' };

// NOTE: This is a starting template, not legal advice. Before submitting to the
// app stores, have it reviewed and replace the [bracketed] placeholders.
export default function TermsPage() {
  return (
    <main className="min-h-screen max-w-md mx-auto px-5 pt-6 pb-24">
      <Link href="/account" className="text-sub hover:text-ink text-sm">‹ Back</Link>
      <h1 className="text-2xl font-black text-ink mt-3 mb-1">Terms of Use</h1>
      <p className="text-[11px] text-dim mb-6">Last updated: June 2026</p>

      <div className="space-y-5 text-sm text-sub leading-relaxed">
        <Section title="Not gambling — no real money">
          BallIQ is a free game of skill. It is <b className="text-ink">not</b> a gambling or
          betting service. There is no real-money wagering, no deposits or withdrawals, and no
          prizes of monetary value. Predictions are scored only as an Elo skill rating. Odds
          shown are used to set difficulty, never to facilitate a wager.
        </Section>

        <Section title="Acceptance">
          By creating an account or using BallIQ, you agree to these Terms. If you do not
          agree, please don’t use the app.
        </Section>

        <Section title="Eligibility">
          You must be at least 13 years old to use BallIQ and be able to form a binding
          agreement in your jurisdiction.
        </Section>

        <Section title="Your account">
          You’re responsible for activity on your account and for keeping your login secure.
          Don’t impersonate others, abuse the service, attempt to manipulate ratings, or use
          it for unlawful purposes. You may delete your account at any time from Account →
          Delete account.
        </Section>

        <Section title="Sports data">
          Odds and scores are provided by a third-party data source and may be delayed,
          incomplete, or incorrect. BallIQ isn’t responsible for the accuracy of that data,
          and results may be settled or voided based on the information available.
        </Section>

        <Section title="No warranty">
          BallIQ is provided “as is,” without warranties of any kind. We don’t guarantee the
          service will be uninterrupted, error-free, or available at all times.
        </Section>

        <Section title="Limitation of liability">
          To the fullest extent permitted by law, BallIQ and its operators are not liable for
          any indirect, incidental, or consequential damages arising from your use of the
          service.
        </Section>

        <Section title="Changes & termination">
          We may update these Terms or modify, suspend, or discontinue the service at any time.
          Continued use after changes means you accept the updated Terms.
        </Section>

        <Section title="Contact">
          Questions? Email <b className="text-ink">[support@yourdomain.com]</b>.
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

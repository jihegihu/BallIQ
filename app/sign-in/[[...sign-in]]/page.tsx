import ClerkAuthCard from '@/components/ClerkAuthCard';

export default function SignInPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-base">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black tracking-tight text-ink leading-none">
          Ball<span className="text-accent">IQ</span>
        </h1>
        <p className="text-xs text-dim mt-1 uppercase tracking-widest">Sports Elo Platform</p>
      </div>
      <ClerkAuthCard mode="sign-in" />
    </main>
  );
}

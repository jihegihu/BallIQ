'use client';

import { usePathname } from 'next/navigation';
import EloHeader from '@/components/EloHeader';
import BottomNav from '@/components/BottomNav';
import OnboardingModal from '@/components/OnboardingModal';

// Routes where the app shell (Elo bar + bottom nav) should not render —
// auth screens and public legal pages viewed by signed-out visitors.
const BARE_ROUTES = ['/sign-in', '/sign-up'];

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_ROUTES.some((p) => pathname.startsWith(p));

  if (bare) {
    return <div className="flex-1">{children}</div>;
  }

  return (
    <>
      <OnboardingModal />
      <EloHeader />
      {/* pt-11 reserves space for the fixed top bar */}
      <div className="flex-1 pt-11">{children}</div>
      <BottomNav />
    </>
  );
}

'use client';

import { usePathname } from 'next/navigation';
import EloHeader from '@/components/EloHeader';
import BottomNav from '@/components/BottomNav';
import OnboardingModal from '@/components/OnboardingModal';
import PushRegistrar from '@/components/PushRegistrar';
import PullToRefresh from '@/components/PullToRefresh';

// Routes where the app shell (Elo bar + bottom nav) should not render —
// auth screens and public legal pages viewed by signed-out visitors.
const BARE_ROUTES = ['/sign-in', '/sign-up'];

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_ROUTES.some((p) => pathname.startsWith(p));

  // PushRegistrar renders nothing, and it mounts OUTSIDE the `bare` check on
  // purpose: signing out redirects to /sign-in, so that is exactly where its
  // signed-out cleanup needs to run. Leaving it inside meant the one route
  // that always follows a sign-out was the one route that never swept the
  // device's push token.
  if (bare) {
    return (
      <>
        <PushRegistrar />
        <div className="flex-1">{children}</div>
      </>
    );
  }

  return (
    <>
      <PushRegistrar />
      <OnboardingModal />
      <EloHeader />
      {/* reserves space for the fixed top bar (h-12 + notch safe area) */}
      <PullToRefresh>
        <div className="flex-1" style={{ paddingTop: 'calc(3rem + env(safe-area-inset-top))' }}>{children}</div>
      </PullToRefresh>
      <BottomNav />
    </>
  );
}

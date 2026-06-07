'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function NavIcon({ type, active }: { type: string; active: boolean }) {
  const cls = `w-[22px] h-[22px] transition-colors ${active ? 'text-accent' : 'text-dim'}`;

  if (type === 'home') return (
    <svg className={cls} viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  );
  if (type === 'picks') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
  if (type === 'leaderboard') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
  if (type === 'account') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
  return null;
}

const NAV_ITEMS = [
  { href: '/',            label: 'Games',   type: 'home' },
  { href: '/picks',       label: 'Picks',   type: 'picks' },
  { href: '/leaderboard', label: 'Ranks',   type: 'leaderboard' },
  { href: '/account',     label: 'Account', type: 'account' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-rim">
      <div className="flex max-w-md mx-auto h-16">
        {NAV_ITEMS.map(({ href, label, type }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors
                ${active ? 'text-accent' : 'text-dim hover:text-sub'}`}
            >
              <NavIcon type={type} active={active} />
              <span className="text-[10px] font-semibold tracking-wide">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

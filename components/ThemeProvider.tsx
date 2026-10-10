'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/lib/themeStore';

// Matches --c-base for each theme in globals.css.
const BASE = { dark: '#06080F', light: '#F1F5F9' } as const;

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const setTheme = useThemeStore((s) => s.setTheme);
  const theme    = useThemeStore((s) => s.theme);

  useEffect(() => {
    const stored = localStorage.getItem('balliq-theme') as 'dark' | 'light' | null;
    setTheme(stored ?? 'dark');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep <meta name="theme-color"> in step with the in-app toggle. The static
  // value in layout.tsx is dark-only, so a light-mode user previously got a
  // near-black browser chrome / status bar strip above a light page. This can't
  // be done with a prefers-color-scheme media query because the theme here is
  // a manual choice, not an OS one.
  useEffect(() => {
    let tag = document.querySelector('meta[name="theme-color"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'theme-color');
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', BASE[theme]);
  }, [theme]);

  return <>{children}</>;
}

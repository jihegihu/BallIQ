'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/lib/themeStore';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const setTheme = useThemeStore((s) => s.setTheme);

  useEffect(() => {
    const stored = localStorage.getItem('balliq-theme') as 'dark' | 'light' | null;
    setTheme(stored ?? 'dark');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}

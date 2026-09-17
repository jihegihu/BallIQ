'use client';

// Native-app polish — iOS/Android shell only. Same pattern as PushRegistrar:
// every Capacitor import is dynamic and behind isNativePlatform(), so the web
// bundle never touches native APIs.
//
// Responsibilities:
//  - keep the iOS status bar style in sync with the app theme
//  - hide the splash screen once the web UI has actually painted
//  - hide the keyboard accessory bar (the grey "< > Done" strip — a web tell)

import { useEffect } from 'react';
import { useThemeStore } from '@/lib/themeStore';

export default function NativeShell() {
  const theme = useThemeStore((s) => s.theme);

  // One-time setup on launch.
  useEffect(() => {
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;

        // Native-only CSS hooks (scrollbar hiding etc.) key off this class —
        // regular browsers keep their scrollbars.
        document.documentElement.classList.add('native');

        const { SplashScreen } = await import('@capacitor/splash-screen');
        // React has mounted and painted — safe to reveal the app.
        await SplashScreen.hide();

        if (Capacitor.getPlatform() === 'ios') {
          const { Keyboard } = await import('@capacitor/keyboard');
          await Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
        }
      } catch (err) {
        console.warn('[native] shell setup failed', err);
      }
    })();
  }, []);

  // Status bar follows the theme (light text on dark bg and vice versa).
  useEffect(() => {
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;

        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: theme === 'light' ? Style.Light : Style.Dark });
      } catch (err) {
        console.warn('[native] status bar sync failed', err);
      }
    })();
  }, [theme]);

  return null;
}

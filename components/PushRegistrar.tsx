'use client';

// Registers the device for push notifications — native app only. On the web
// this is a no-op: the Capacitor checks short-circuit before the push plugin is
// ever imported, so the browser bundle never touches native APIs.

import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

export default function PushRegistrar() {
  const { isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;

        const { PushNotifications } = await import('@capacitor/push-notifications');

        // Send the token to our server once iOS hands it to us.
        await PushNotifications.addListener('registration', (token) => {
          if (cancelled) return;
          fetch('/api/push/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token.value, platform: Capacitor.getPlatform() }),
          }).catch(() => { /* offline — the next launch re-registers */ });
        });

        await PushNotifications.addListener('registrationError', (err) => {
          console.warn('[push] registration error', err);
        });

        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
          perm = await PushNotifications.requestPermissions();
        }
        if (perm.receive !== 'granted') return;

        await PushNotifications.register();
      } catch (err) {
        console.warn('[push] setup failed', err);
      }
    })();

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn]);

  return null;
}

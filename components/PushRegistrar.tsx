'use client';

// Keeps this device's push registration in step with who is signed in —
// native app only. On the web this is a no-op: the Capacitor checks
// short-circuit before the push plugin is ever imported, so the browser
// bundle never touches native APIs.
//
// It runs in BOTH directions, which is the point:
//
//   signed in  → register, and tell the server this device belongs to them
//   signed out → delete the server's record, so nothing can be sent here
//
// The signed-out branch is the safety net. Sign-out itself calls
// unregisterDevice() directly (see app/account/page.tsx), but that call can
// fail — no signal, app killed mid-redirect, or a session that expired
// without the user ever pressing Sign out. Without this branch any of those
// left a live token on the server pointing at a user who had logged out, and
// the next settlement sync happily pushed "your picks settled" to a phone
// whose owner had signed out days earlier. Re-checking on every launch means
// the leak closes itself even when the sign-out never got the chance.

import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { rememberToken, storedToken, unregisterDevice } from '@/lib/pushDevice';

/** IANA zone name, e.g. 'America/Denver'. undefined if the engine won't say. */
function deviceTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export default function PushRegistrar() {
  const { isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    if (!isLoaded) return;

    // ── Signed out: make sure this device is not on anybody's send list ──────
    if (!isSignedIn) {
      // Only act if we actually left something behind, so a signed-out
      // visitor on the web does no work and makes no requests.
      if (storedToken()) void unregisterDevice();
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;

        const { PushNotifications } = await import('@capacitor/push-notifications');

        // Clear any listeners from a previous session on this install, so
        // signing in as someone else cannot leave the old handler attached.
        await PushNotifications.removeAllListeners();

        // Send the token to our server once iOS hands it to us.
        await PushNotifications.addListener('registration', (token) => {
          if (cancelled) return;
          // Remember it first: sign-out needs to be able to name this token
          // even if the POST below never lands.
          rememberToken(token.value);
          fetch('/api/push/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: token.value,
              platform: Capacitor.getPlatform(),
              // The handset is the only thing that knows where it is, and the
              // daily notifications are sent on local time. Re-sent on every
              // launch, so moving timezone fixes itself without any prompt.
              timezone: deviceTimezone(),
            }),
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

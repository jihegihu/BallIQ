// Device-side ownership of the APNs push token.
//
// The server cannot tell that someone signed out — it only has rows in
// push_tokens, and a row keeps naming its user forever. So the device has to
// say so. That is what this module is for: it remembers which token this
// install handed to the server, so that on sign-out we can name it and have
// the row deleted.
//
// Why localStorage and not just asking the push plugin: by the time the user
// signs out we may have no live registration to read a token from, and after a
// failed/offline sign-out the next launch has no session either. The stored
// copy is the only thing that survives both.
//
// All of this is a no-op on the web — the Capacitor check short-circuits
// before the push plugin is imported, so the browser bundle never touches
// native APIs.

const KEY = 'balliq-push-token';

export function rememberToken(token: string): void {
  try { localStorage.setItem(KEY, token); } catch { /* private mode */ }
}

export function storedToken(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

function forgetToken(): void {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}

/**
 * Stop this device receiving notifications, and delete the server's record of
 * it. Safe to call when signed out, on the web, or when nothing is registered.
 *
 * Call it BEFORE Clerk's signOut(): the DELETE does not need a session, but
 * tearing down the native registration while the app is still settled is
 * tidier than racing a redirect.
 *
 * Deliberately never throws. A sign-out must not be blocked by a push failure
 * — and it does not have to be, because this is belt-and-braces: the token is
 * also cleaned up on the next launch by PushRegistrar if this call never
 * lands.
 */
export async function unregisterDevice(): Promise<void> {
  const token = storedToken();

  // Clear the local copy first. If the network call fails we still must not
  // leave a stale token behind for a *different* account to inherit on this
  // device; the server-side row is swept on the next launch instead.
  forgetToken();

  if (token) {
    try {
      await fetch('/api/push/register', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token }),
        // The page is often navigating away as this fires.
        keepalive: true,
      });
    } catch { /* swept on next launch */ }
  }

  // Hand the registration back to the OS and clear anything already sitting
  // in Notification Center, so signing out visibly ends the relationship
  // rather than leaving old alerts on the lock screen.
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllListeners();
    await PushNotifications.removeAllDeliveredNotifications();
    await PushNotifications.unregister();
  } catch { /* plugin absent or already torn down */ }
}

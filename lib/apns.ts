// Server-side Apple Push Notification service (APNs) sender.
//
// Token-based auth (a .p8 key) over HTTP/2 — no third-party SDK, no Firebase.
// Uses only Node built-ins, so it runs in the Vercel Node runtime. Every call
// is best-effort: it never throws into the caller, it returns a summary plus
// the tokens Apple reported as dead so the caller can prune them.
//
// Required env vars (set in Vercel):
//   APNS_KEY_ID        — the 10-char Key ID of your .p8 auth key
//   APNS_TEAM_ID       — your 10-char Apple Developer Team ID
//   APNS_BUNDLE_ID     — the app bundle id (dev.balliq.app) → apns-topic
//   APNS_PRIVATE_KEY   — the full .p8 contents (BEGIN/END PRIVATE KEY block)
//   APNS_PRODUCTION    — "true" for TestFlight/App Store builds, else sandbox

import http2 from 'node:http2';
import crypto from 'node:crypto';

export type PushNotification = {
  title: string;
  body: string;
  badge?: number;
  data?: Record<string, unknown>;
};

export type PushResult = {
  sent: number;
  failed: number;
  skipped: boolean;        // env not configured — nothing attempted
  invalidTokens: string[]; // tokens Apple rejected as dead (410 / BadDeviceToken)
};

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

// APNs JWTs are valid up to 1 hour. One per invocation is well within Apple's
// rules (they reject tokens refreshed more than once every 20 minutes, not less).
function buildJwt(keyId: string, teamId: string, privateKey: string): string {
  const header  = base64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const payload = base64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto
    .sign('SHA256', Buffer.from(signingInput), { key: privateKey, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');
  return `${signingInput}.${signature}`;
}

export async function sendApnsPush(
  tokens: string[],
  notification: PushNotification,
): Promise<PushResult> {
  const keyId   = process.env.APNS_KEY_ID;
  const teamId  = process.env.APNS_TEAM_ID;
  const topic   = process.env.APNS_BUNDLE_ID;
  // Vercel env vars can store the newlines literally or escaped — accept both.
  const rawKey  = process.env.APNS_PRIVATE_KEY;
  const privateKey = rawKey?.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;

  if (!keyId || !teamId || !topic || !privateKey) {
    return { sent: 0, failed: 0, skipped: true, invalidTokens: [] };
  }
  const uniqueTokens = [...new Set(tokens)].filter(Boolean);
  if (uniqueTokens.length === 0) {
    return { sent: 0, failed: 0, skipped: false, invalidTokens: [] };
  }

  const host = process.env.APNS_PRODUCTION === 'true'
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com';

  const jwt = buildJwt(keyId, teamId, privateKey);
  const payload = JSON.stringify({
    aps: {
      alert: { title: notification.title, body: notification.body },
      sound: 'default',
      ...(notification.badge !== undefined ? { badge: notification.badge } : {}),
    },
    ...(notification.data ?? {}),
  });

  return new Promise<PushResult>((resolve) => {
    const client = http2.connect(host);
    const invalidTokens: string[] = [];
    let sent = 0, failed = 0, pending = uniqueTokens.length, settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      client.close();
      resolve({ sent, failed, skipped: false, invalidTokens });
    };

    // If the connection itself fails, count everything as failed rather than hang.
    client.on('error', () => { failed = uniqueTokens.length; sent = 0; finish(); });

    for (const token of uniqueTokens) {
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        'authorization': `bearer ${jwt}`,
        'apns-topic': topic,
        'apns-push-type': 'alert',
      });

      let status = 0;
      let body = '';
      req.on('response', (headers) => { status = Number(headers[':status']) || 0; });
      req.setEncoding('utf8');
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        if (status === 200) {
          sent++;
        } else {
          failed++;
          // 410 Unregistered or 400 BadDeviceToken → the token is dead, prune it.
          if (status === 410 || body.includes('BadDeviceToken') || body.includes('Unregistered')) {
            invalidTokens.push(token);
          }
        }
        if (--pending === 0) finish();
      });
      req.on('error', () => { failed++; if (--pending === 0) finish(); });

      req.write(payload);
      req.end();
    }
  });
}

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.balliq.app',
  appName: 'BallIQ',

  // The native shell loads the live hosted site (server.url below). `webDir` is
  // only the local offline fallback that ships inside the app bundle.
  webDir: 'www',

  server: {
    // ⚠️ REPLACE with your EXACT Vercel production URL before building on the
    // Mac. Find it in Vercel → your project → Domains (the *.vercel.app entry).
    // This default is a guess based on the repo name and is probably not exact.
    url: 'https://balliq.vercel.app',
    cleartext: false,
  },

  ios: {
    contentInset: 'always',
  },
};

export default config;

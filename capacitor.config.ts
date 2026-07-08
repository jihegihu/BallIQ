import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.balliq.app',
  appName: 'BallIQ',

  // The native shell loads the live hosted site (server.url below). `webDir` is
  // only the local offline fallback that ships inside the app bundle.
  webDir: 'www',

  server: {
    // Canonical production domain. Until balliq.dev finishes DNS propagation you
    // can temporarily use 'https://ball-iq-phi.vercel.app' for Mac test builds.
    url: 'https://balliq.dev',
    cleartext: false,
  },

  ios: {
    contentInset: 'always',
  },
};

export default config;

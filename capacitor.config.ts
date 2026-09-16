import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

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
    // Hosts the WKWebView may navigate to in-app. Anything NOT listed here is
    // ejected to Safari — which is exactly the bug we saw with Clerk auth flows.
    // clerk.accounts.dev covers the Clerk dev instance; clerk.balliq.dev is
    // already covered by *.balliq.dev. Deliberately NOT listing
    // accounts.google.com: Google blocks OAuth inside embedded webviews
    // (disallowed_useragent), so Google sign-in needs a native flow instead.
    allowNavigation: [
      'balliq.dev',
      '*.balliq.dev',
      '*.clerk.accounts.dev',
      'ball-iq-phi.vercel.app',
    ],
  },

  ios: {
    contentInset: 'always',
    // Kill the iOS webview rubber-band bounce at the page edges — the single
    // biggest "this is a website" tell.
    scrollEnabled: true,
  },

  plugins: {
    SplashScreen: {
      // We hide manually from JS once the UI has painted (NativeShell.tsx);
      // this is just the failsafe so a JS error can't strand the splash.
      launchAutoHide: true,
      launchShowDuration: 3000,
      backgroundColor: '#06080F',
    },
    Keyboard: {
      // Don't let iOS shove the whole webview up when the keyboard opens.
      resize: KeyboardResize.None,
    },
  },
};

export default config;

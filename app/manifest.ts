import type { MetadataRoute } from 'next';

// Served at /manifest.webmanifest and auto-linked by Next. Makes BallIQ an
// installable PWA and is the icon/colour source Capacitor will read later.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BallIQ — Sports Picks & Elo',
    short_name: 'BallIQ',
    description: 'Predict real games and climb a chess-style Elo rating. Pure skill — no real money.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#06080F',
    theme_color: '#06080F',
    categories: ['sports', 'games'],
    icons: [
      { src: '/icon-192.png',      sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png',      sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

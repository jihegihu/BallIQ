// Rasterizes public/icon.svg into the PNG icon set used by the PWA manifest,
// iOS home screen, and (later) Capacitor. Re-run after replacing icon.svg with
// a real logo:  node scripts/generate-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg  = readFileSync(join(root, 'public', 'icon.svg'));

const targets = [
  { file: 'icon-192.png',         size: 192 },
  { file: 'icon-512.png',         size: 512 },
  { file: 'icon-maskable.png',    size: 512 }, // art is already full-bleed + safe-zoned
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of targets) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(join(root, 'public', file));
  console.log(`wrote public/${file} (${size}x${size})`);
}

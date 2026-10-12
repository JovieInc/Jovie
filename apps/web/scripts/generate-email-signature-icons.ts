/**
 * Generate transparent 32px PNG brand icons for email signatures.
 *
 * Renders every entry of the canonical `SOCIAL_ICON_DATA` registry
 * (`lib/social-icons/icon-data.ts`) through sharp and writes one
 * `<normalized-key>.png` per platform under
 * `public/email-signature/social-icons/generated/<version>/`. The runtime URL map
 * lives in `lib/email-signature/social-icons.ts`.
 *
 * Usage: pnpm --filter web generate:email-signature-icons
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { EMAIL_SIGNATURE_ICON_BASE_PATH } from '../lib/email-signature/icon-path';
import { SOCIAL_ICON_DATA } from '../lib/social-icons/icon-data';
import { normalizeSocialIconKey } from '../lib/social-icons/normalize';

const ICON_SIZE_PX = 32;
// Render the 24x24 viewBox well above the target size so the PNG downscale
// stays crisp, then resize to the exported 32px canvas.
const RENDER_DENSITY = 300;

const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  ...EMAIL_SIGNATURE_ICON_BASE_PATH.split('/').filter(Boolean)
);

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });

  // Dedupe keys that normalize together (e.g. `apple_music`, `applemusic`,
  // `apple` all collapse to `applemusic`) so each platform writes one file.
  const rendered = new Map<string, { hex: string; path: string }>();
  for (const [key, icon] of Object.entries(SOCIAL_ICON_DATA)) {
    const normalized = normalizeSocialIconKey(key);
    if (!normalized || rendered.has(normalized)) continue;
    rendered.set(normalized, icon);
  }

  for (const [key, icon] of [...rendered.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
      `<path fill="#${icon.hex}" d="${icon.path}"/></svg>`;
    const png = await sharp(Buffer.from(svg), { density: RENDER_DENSITY })
      .resize(ICON_SIZE_PX, ICON_SIZE_PX)
      .png()
      .toBuffer();
    await writeFile(path.join(outDir, `${key}.png`), png);
  }

  console.log(`Wrote ${rendered.size} icons to ${outDir}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

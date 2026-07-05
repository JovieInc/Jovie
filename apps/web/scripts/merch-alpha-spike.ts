/**
 * Alpha-knockout spike (throwaway). Proves gpt-image transparent output drops
 * cleanly onto a garment color (Tim: "alpha'd clean so it can be dropped onto
 * objects for the comp and product printing").
 *
 *   doppler run --project jovie-web --config dev -- \
 *     pnpm --filter @jovie/web exec tsx scripts/merch-alpha-spike.ts
 *
 * Outputs: <repo>/.context/spike-merch/alpha.png  (raw transparent art)
 *          <repo>/.context/spike-merch/alpha-on-pink.png  (composited on hot pink)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gateway } from '@ai-sdk/gateway';
import { generateImage } from 'ai';
import sharp from 'sharp';

const OUT_DIR = resolve(process.cwd(), '../../.context/spike-merch');
const PROMPT = [
  'Vintage distressed band-merch graphic, screen-print texture, heavy wash and grain.',
  'A cool panda in sunglasses surfing a big ocean wave, red rising sun, palm trees.',
  'Bold gnarly metal display lettering "PANADA" on top, rough script "RIDE THE WAVES" below.',
  'Retro cream/teal/red/black palette, high detail, centered, no background.',
].join(' ');

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const result = await generateImage({
    model: gateway.image('openai/gpt-image-1.5'),
    prompt: PROMPT,
    size: '1024x1024',
    providerOptions: { openai: { background: 'transparent' } },
  });
  const img = result.images[0] as { uint8Array?: Uint8Array; base64?: string };
  const raw = img.uint8Array
    ? Buffer.from(img.uint8Array)
    : Buffer.from(img.base64 ?? '', 'base64');
  writeFileSync(resolve(OUT_DIR, 'alpha.png'), raw);

  // Composite onto a hot-pink garment swatch — the real "drop onto product" test.
  const pink = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 233, g: 74, b: 156, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const onPink = await sharp(pink)
    .composite([{ input: raw, gravity: 'center' }])
    .png()
    .toBuffer();
  writeFileSync(resolve(OUT_DIR, 'alpha-on-pink.png'), onPink);

  // Report alpha channel stats so we know it's truly transparent, not white-boxed.
  const stats = await sharp(raw).stats();
  const hasAlpha = (await sharp(raw).metadata()).hasAlpha;
  console.log(
    `alpha.png ${(raw.length / 1024) | 0}KB hasAlpha=${hasAlpha} channels=${stats.channels.length}`
  );
  console.log(`Outputs in ${OUT_DIR}`);
}

void main();

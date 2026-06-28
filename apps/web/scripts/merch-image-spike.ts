/**
 * Merch image-gen quality spike (throwaway).
 *
 * Proves whether we can hit Tim's quality bar (the GPT-image "PANADA / RIDE THE
 * WAVES" vintage band tee) by generating the same kind of print graphic across
 * all three gateway image models. Run, then eyeball the outputs vs the reference.
 *
 *   doppler run --project jovie-web --config dev -- \
 *     pnpm --filter @jovie/web exec tsx scripts/merch-image-spike.ts
 *
 * Outputs: <repo>/.context/spike-merch/<model>.png
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gateway } from '@ai-sdk/gateway';
import { generateImage } from 'ai';

const OUT_DIR = resolve(process.cwd(), '../../.context/spike-merch');

// Mirrors the reference aesthetic so it's an apples-to-apples quality read.
const PROMPT = [
  'Vintage distressed band-merch t-shirt graphic, screen-print texture with heavy wash and grain.',
  'Subject: a cool panda wearing sunglasses surfing a big ocean wave, a red rising sun behind,',
  'palm trees and a small tropical island in the background.',
  'Bold gnarly hand-drawn metal/punk display lettering reading "PANADA" across the top,',
  'and a rough script tagline "RIDE THE WAVES" along the bottom.',
  'Limited retro color palette (cream, teal, red, black), high detail, centered composition,',
  'isolated as cleanly cut artwork on a flat dark charcoal background. Print-ready, no garment, no mockup.',
].join(' ');

const ALL_MODELS = [
  { id: 'openai/gpt-image-1.5', label: 'gpt-image-1.5' },
  { id: 'openai/gpt-image-1', label: 'gpt-image-1' },
  { id: 'bfl/flux-2-pro', label: 'flux-2-pro' },
  { id: 'bfl/flux-pro-1.1-ultra', label: 'flux-1.1-ultra' },
  { id: 'xai/grok-imagine-image', label: 'grok-imagine' },
  { id: 'google/imagen-4.0-ultra-generate-001', label: 'imagen-4-ultra' },
] as const;

// Optional argv filter by label substring, e.g. `tsx ... grok imagen`
const filters = process.argv.slice(2);
const MODELS = filters.length
  ? ALL_MODELS.filter(m => filters.some(f => m.label.includes(f)))
  : ALL_MODELS;

function toBuffer(image: { uint8Array?: Uint8Array; base64?: string }): Buffer {
  if (image.uint8Array) return Buffer.from(image.uint8Array);
  if (image.base64) return Buffer.from(image.base64, 'base64');
  throw new Error('image result had no bytes');
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const m of MODELS) {
    const started = Date.now();
    try {
      const result = await generateImage({
        model: gateway.image(m.id),
        prompt: PROMPT,
        size: '1024x1024',
      });
      const buf = toBuffer(
        result.images[0] as { uint8Array?: Uint8Array; base64?: string }
      );
      const out = resolve(OUT_DIR, `${m.label}.png`);
      writeFileSync(out, buf);
      console.log(
        `OK   ${m.label} (${m.id}) ${Date.now() - started}ms -> ${out} (${(buf.length / 1024) | 0}KB)`
      );
    } catch (err) {
      console.log(
        `FAIL ${m.label} (${m.id}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  console.log(`\nDone. Outputs in ${OUT_DIR}`);
}

void main();

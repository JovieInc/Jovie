/**
 * Knockout spike (throwaway) for #10 — enabling more models in the A/B.
 * Tests two ways to get alpha-clean art from non-gpt-image models:
 *  A) Recraft native transparent background (no knockout).
 *  B) Flux on a flat chroma background → Sharp chroma-key knockout.
 * Outputs each composited on hot pink so we can judge edge quality.
 *
 *   doppler run --project jovie-web --config dev -- \
 *     pnpm --filter @jovie/web exec tsx scripts/merch-knockout-spike.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gateway } from '@ai-sdk/gateway';
import { generateImage } from 'ai';
import sharp from 'sharp';

const OUT = resolve(process.cwd(), '../../.context/spike-merch');
const SUBJECT =
  'Vintage distressed band-merch graphic: a cool panda in sunglasses surfing a wave, red sun, palm trees, bold metal lettering "PANADA", retro cream/teal/red palette, high detail.';

async function toBuf(r: {
  images: { uint8Array?: Uint8Array; base64?: string }[];
}): Promise<Buffer> {
  const i = r.images[0];
  return i.uint8Array
    ? Buffer.from(i.uint8Array)
    : Buffer.from(i.base64 ?? '', 'base64');
}

/** Remove pixels within `tol` RGB distance of the flat key color → alpha 0. */
async function chromaKnockout(
  png: Buffer,
  key: { r: number; g: number; b: number },
  tol: number
): Promise<Buffer> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  for (let i = 0; i < data.length; i += ch) {
    const dr = data[i] - key.r;
    const dg = data[i + 1] - key.g;
    const db = data[i + 2] - key.b;
    if (Math.sqrt(dr * dr + dg * dg + db * db) < tol) data[i + 3] = 0;
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: ch },
  })
    .png()
    .toBuffer();
}

async function onPink(png: Buffer, name: string) {
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
  const out = await sharp(pink)
    .composite([{ input: png, gravity: 'center' }])
    .png()
    .toBuffer();
  writeFileSync(resolve(OUT, `knockout-${name}-on-pink.png`), out);
  const meta = await sharp(png).metadata();
  console.log(
    `  ${name}: hasAlpha=${meta.hasAlpha} bytes=${(png.length / 1024) | 0}KB`
  );
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  // A) Recraft native transparent
  try {
    const r = await generateImage({
      model: gateway.image('recraft/recraft-v3'),
      prompt: `${SUBJECT} Isolated on a fully transparent background, sticker style, die-cut.`,
      size: '1024x1024',
      providerOptions: { recraft: { response_format: 'png' } },
    });
    const buf = await toBuf(r);
    writeFileSync(resolve(OUT, 'knockout-recraft.png'), buf);
    await onPink(buf, 'recraft');
  } catch (e) {
    console.log(
      `  recraft FAIL: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // B) Flux on flat magenta → chroma-key knockout
  try {
    const r = await generateImage({
      model: gateway.image('bfl/flux-2-pro'),
      prompt: `${SUBJECT} The artwork sits on a completely flat, solid magenta (#FF00FF) background with no magenta anywhere in the artwork itself.`,
      size: '1024x1024',
    });
    const raw = await toBuf(r);
    writeFileSync(resolve(OUT, 'knockout-flux-raw.png'), raw);
    const keyed = await chromaKnockout(raw, { r: 255, g: 0, b: 255 }, 110);
    writeFileSync(resolve(OUT, 'knockout-flux-keyed.png'), keyed);
    await onPink(keyed, 'flux-keyed');
  } catch (e) {
    console.log(`  flux FAIL: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log(`Outputs in ${OUT}`);
}

void main();

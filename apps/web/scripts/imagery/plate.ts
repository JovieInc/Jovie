/**
 * Generates stage plates: abstract matte backgrounds, no text, no people.
 *
 *   pnpm --filter @jovie/web imagery:plate --id <plateId> [--stale]
 *
 * `--id` generates one plate; `--stale` generates every plate whose recipe or
 * stage light/quiet-zone spec changed (or that was never generated). Spec:
 * docs/marketing/IMAGERY.md.
 *
 * Model: Cloudflare Workers AI `@cf/black-forest-labs/flux-1-schnell`, called
 * through packages/api-client (`createApiClient`, provider `cloudflare`) so
 * the per-credential daily USD cap and breaker apply
 * (.claude/rules/external-apis.md). Credential: CLOUDFLARE_WORKERS_AI_TOKEN,
 * else the local `wrangler login` token (see resolveWorkersAiAuth). No
 * fallback model is called silently: if Workers AI is unreachable the run
 * fails and says so.
 *
 * The model supplies soft texture only. `grade.ts` imposes the one accent hue,
 * the lit wedge and the quiet zone, then the plate is encoded to AVIF and
 * WebP under the byte budget and must pass the art-direction image scan
 * (smoothness, single hue, no orange, sidecar) before it is written.
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { createApiClient } from '../../../../packages/api-client/client.ts';
import { providerSpec } from '../../../../packages/api-client/contract.ts';
import { hashCredential } from '../../../../packages/api-client/store.ts';
import {
  analyzePixels,
  classifyPlate,
} from '../../../../scripts/invariants/art-direction/images.mjs';
import { resolveWorkersAiAuth } from '../../../../scripts/invariants/clef-screenshot-evaluator.mjs';
import { JOVIE_IMAGE_COLOR_POLICY } from '../../data/marketing/imageColorPolicy';
import {
  IMAGERY_PLATE_MAX_BYTES,
  type ImageryStageSpec,
  plateFiles,
} from '../../lib/imagery/stages';
import { gradePlate, hexToRgb, seedFromHash } from './grade';
import {
  PLATE_OUT_DIR,
  type PlateEntry,
  readImageryManifest,
  WEB_ROOT,
  writeImageryManifest,
} from './manifest';
import { buildPlatePrompt } from './prompt';
import { parsePlateArgs, selectPlates } from './select';
import { hashPlateSpec, hashPrompt } from './spec-hash.mjs';

export const PLATE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const PLATE_WIDTH = 1920;
export const PLATE_HEIGHT = 1080;
/** flux-1-schnell on Workers AI: about $0.0009 for 1024x1024 at 6 steps. */
export const PLATE_PRICE_USD = 0.001;
export const PLATE_DAILY_CAP_USD = 0.25;
const STEPS = 6;

function accentHex(accent: string): string {
  const entry = JOVIE_IMAGE_COLOR_POLICY.scenePalette.find(
    p => p.role === accent
  );
  if (!entry) throw new Error(`No scene palette entry for ${accent}`);
  return entry.sceneReference.hex;
}

async function callFlux(prompt: string): Promise<Buffer> {
  const auth = resolveWorkersAiAuth();
  const spec = providerSpec('cloudflare');
  const client = createApiClient({
    provider: 'cloudflare',
    credential: hashCredential('cloudflare', auth.token),
    authorize: headers => {
      headers.set('Authorization', `Bearer ${auth.token}`);
    },
    dailySpendCapUsd: PLATE_DAILY_CAP_USD,
  });
  const res = await client.request({
    url: `https://${spec.hosts[0]}${spec.pathPrefix}accounts/${auth.accountId}/ai/run/${PLATE_MODEL}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { prompt, steps: STEPS },
    priority: 'default',
    write: false,
    idempotent: true,
    maxAttempts: 2,
    maxWaitMs: 90_000,
    timeoutMs: 90_000,
    priceUsd: PLATE_PRICE_USD,
  });
  const body = res.json() as {
    success?: boolean;
    result?: { image?: string };
    errors?: { code?: number }[];
  } | null;
  if (res.status < 200 || res.status >= 300 || !body?.success) {
    throw new Error(
      `workers-ai-error-${body?.errors?.[0]?.code ?? res.status} (${PLATE_MODEL})`
    );
  }
  if (!body.result?.image) throw new Error('workers-ai returned no image');
  return Buffer.from(body.result.image, 'base64');
}

async function generatePlate(
  stage: ImageryStageSpec,
  source?: Buffer
): Promise<PlateEntry> {
  const prompt = buildPlatePrompt(stage);
  const promptHash = hashPrompt(prompt);
  const seed = seedFromHash(promptHash);
  const image = source ?? (await callFlux(prompt));

  const { data } = await sharp(image)
    .resize(PLATE_WIDTH, PLATE_HEIGHT, { fit: 'cover' })
    .blur(24)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const luma = new Float32Array(PLATE_WIDTH * PLATE_HEIGHT);
  for (let i = 0; i < luma.length; i += 1) luma[i] = data[i] / 255;

  const rgb = gradePlate({
    luma,
    width: PLATE_WIDTH,
    height: PLATE_HEIGHT,
    light: stage.light,
    safeArea: stage.safeArea,
    accentRgb: hexToRgb(accentHex(stage.plate.accent)),
    seed,
  });
  const graded = sharp(Buffer.from(rgb), {
    raw: { width: PLATE_WIDTH, height: PLATE_HEIGHT, channels: 3 },
  });

  mkdirSync(PLATE_OUT_DIR, { recursive: true });
  const files = plateFiles(stage.plate.id);
  const avifPath = path.join(PLATE_OUT_DIR, path.basename(files.avif));
  const webpPath = path.join(PLATE_OUT_DIR, path.basename(files.webp));
  await graded
    .clone()
    .avif({ quality: 48, effort: 7, chromaSubsampling: '4:4:4' })
    .toFile(avifPath);
  await graded.clone().webp({ quality: 74, effort: 6 }).toFile(webpPath);
  const bytes = {
    avif: statSync(avifPath).size,
    webp: statSync(webpPath).size,
  };
  for (const [format, size] of Object.entries(bytes)) {
    if (size > IMAGERY_PLATE_MAX_BYTES) {
      throw new Error(
        `${stage.plate.id}.${format} is ${size} bytes (> ${IMAGERY_PLATE_MAX_BYTES})`
      );
    }
  }

  // Self-check against the same scan CI runs, before anything is recorded.
  const sidecar = {
    schema: 'jovie.marketing-image/v1',
    kind: 'mood-plate',
    accent: stage.plate.accent,
    subject: 'abstract',
    stage: stage.id,
    model: PLATE_MODEL,
    promptHash,
    seed,
    modelSeed: null,
  };
  for (const file of [avifPath, webpPath]) {
    const probe = await sharp(file)
      .resize({ width: 96 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const stats = analyzePixels(
      probe.data,
      probe.info.width,
      probe.info.height
    );
    const found = classifyPlate(path.basename(file), stats, {
      missing: false,
      json: sidecar,
    });
    if (found.ids.length || found.hard.length) {
      throw new Error(
        `${path.basename(file)} fails the art-direction scan: ${[...found.ids, ...found.hard].join(', ')}`
      );
    }
    writeFileSync(`${file}.meta.json`, `${JSON.stringify(sidecar, null, 2)}\n`);
  }

  return {
    specHash: hashPlateSpec(stage),
    promptHash,
    model: PLATE_MODEL,
    modelSeed: null,
    seed,
    accent: stage.plate.accent,
    width: PLATE_WIDTH,
    height: PLATE_HEIGHT,
    generatedAt: new Date().toISOString(),
    costUsd: source ? 0 : PLATE_PRICE_USD,
    bytes,
  };
}

async function main() {
  const args = parsePlateArgs(process.argv.slice(2));
  const manifest = readImageryManifest();
  const stages = selectPlates(args, manifest);
  if (stages.length === 0) {
    process.stdout.write('[imagery:plate] nothing to generate\n');
    return;
  }
  for (const stage of stages) {
    process.stdout.write(
      `[imagery:plate] ${stage.plate.id} (${stage.plate.accent})\n`
    );
    manifest.plates[stage.plate.id] = await generatePlate(stage);
    writeImageryManifest(manifest);
  }
  process.stdout.write(
    `[imagery:plate] wrote ${path.relative(WEB_ROOT, PLATE_OUT_DIR)}\n`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    process.stderr.write(`[imagery:plate] ${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}

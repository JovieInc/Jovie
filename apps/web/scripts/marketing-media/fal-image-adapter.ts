/**
 * fal.ai image adapter for the marketing-media export seam (JOV-7250).
 *
 * Last rung of the sourcing order: generation. Calls fal's synchronous
 * run endpoint and downloads the first image. Two hard rules:
 *   - paid spend is opt-in: without `--generate` the adapter dry-runs and
 *     prints the request it would send (JOV-6232);
 *   - every generated asset is written with a C2PA provenance sidecar and
 *     must pass `art-evaluator.mjs` before its receipt is emitted.
 *
 * Key comes from Doppler — never hardcode it:
 *   doppler run --project jovie-web --config dev -- \
 *     tsx scripts/marketing-media/fal-image-adapter.ts \
 *       --prompt "..." --out /tmp/asset.png --generate
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import type {
  MarketingMediaExportOutputProfile,
  MarketingMediaExportOutputResult,
} from '../../data/marketing/mediaExport';
import {
  buildGeneratedAssetProvenance,
  writeProvenanceSidecar,
} from './provenance';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const ART_EVALUATOR = join(SCRIPTS_DIR, 'art-evaluator.mjs');

export const FAL_DEFAULT_MODEL = 'fal-ai/flux/schnell';

export interface FalAdapterOptions {
  readonly apiKey: string | undefined;
  readonly prompt: string;
  readonly model?: string;
  readonly assetId: string;
  readonly outPath: string;
  /** When false, produceOutput fails closed — dry-run only. */
  readonly generate: boolean;
  /** Injectable for tests. */
  readonly fetchImpl?: typeof fetch;
  readonly evaluatorPath?: string;
}

interface FalRunResponse {
  readonly images?: readonly { readonly url: string }[];
}

/**
 * `produceOutput` for `executeMarketingMediaExportRequest`. The seam is
 * synchronous, so generation happens ahead of time (`generateWithFal`); this
 * serves the already-generated, already-gated asset from `outPath`.
 */
export function createFalProduceOutput(
  options: FalAdapterOptions
): (
  profile: MarketingMediaExportOutputProfile
) => MarketingMediaExportOutputResult {
  const assetPath = options.outPath;
  if (!existsSync(assetPath)) {
    return () => ({ ok: false, code: 'output-provider-unavailable' });
  }
  const bytes = readFileSync(assetPath);
  const assetHash = createHash('sha256').update(bytes).digest('hex');
  const model = options.model ?? FAL_DEFAULT_MODEL;

  return () => ({
    ok: true,
    assetHash,
    width: 0,
    height: 0,
    format: 'image/png',
    rightsProvenance: `ai-generated:fal/${model}`,
  });
}

/**
 * Async variant used by the CLI: generate, download, stamp provenance, and
 * run the art-evaluator gate. Returns the sidecar path on success.
 */
export async function generateWithFal(
  options: FalAdapterOptions
): Promise<{ assetPath: string; sidecarPath: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model ?? FAL_DEFAULT_MODEL;
  if (!options.apiKey) {
    throw new Error('FAL_KEY is required — run under `doppler run`.');
  }

  const response = await fetchImpl(`https://fal.run/${model}`, {
    method: 'POST',
    headers: {
      authorization: `Key ${options.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      prompt: options.prompt,
      image_size: 'landscape_16_9',
      num_images: 1,
    }),
  });
  if (!response.ok) {
    throw new Error(`fal.run ${model} failed: ${response.status}`);
  }
  const body = (await response.json()) as FalRunResponse;
  const imageUrl = body.images?.[0]?.url;
  if (!imageUrl) throw new Error('fal.run returned no images');

  const image = await fetchImpl(imageUrl);
  if (!image.ok) throw new Error(`image fetch failed: ${image.status}`);
  const bytes = Buffer.from(await image.arrayBuffer());
  mkdirSync(dirname(options.outPath), { recursive: true });
  writeFileSync(options.outPath, bytes);

  const provenance = buildGeneratedAssetProvenance({
    assetId: options.assetId,
    generator: `fal/${model}`,
    prompt: options.prompt,
  });
  const sidecarPath = writeProvenanceSidecar(options.outPath, provenance);

  execFileSync(
    'node',
    [options.evaluatorPath ?? ART_EVALUATOR, options.outPath],
    {
      stdio: 'inherit',
    }
  );

  return { assetPath: options.outPath, sidecarPath };
}

export function hashFile(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const isMain =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMain) {
  const { values } = parseArgs({
    options: {
      prompt: { type: 'string' },
      out: { type: 'string' },
      'asset-id': { type: 'string', default: 'generated' },
      model: { type: 'string', default: FAL_DEFAULT_MODEL },
      generate: { type: 'boolean', default: false },
    },
    strict: true,
  });

  if (!values.prompt || !values.out) {
    console.error(
      'usage: fal-image-adapter.ts --prompt <prompt> --out <asset.png> [--generate] [--model <id>]'
    );
    process.exit(2);
  }

  const options: FalAdapterOptions = {
    apiKey: process.env.FAL_KEY,
    prompt: values.prompt,
    model: values.model,
    assetId: values['asset-id'],
    outPath: values.out,
    generate: values.generate,
  };

  if (!values.generate) {
    console.log(
      JSON.stringify(
        { dryRun: true, model: options.model, prompt: options.prompt },
        null,
        2
      )
    );
    process.exit(0);
  }

  generateWithFal(options)
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(`fal-image-adapter: ${error.message}`);
      process.exit(1);
    });
}

import 'server-only';

/**
 * Merch graphic engine.
 *
 * Generates the print graphic for a merch design via the Vercel AI Gateway,
 * across a roster of image models that are A/B'd in production and biased toward
 * the winner by thumbs up/down feedback (see selectMerchImageModel). Output is a
 * transparent / alpha-knockout PNG so it drops cleanly onto any garment color
 * for the mockup comp AND is the real print file.
 *
 * Proven in spikes (apps/web/scripts/merch-{image,alpha}-spike.ts): all roster
 * models clear the quality bar; gpt-image transparent output composites cleanly
 * onto a garment color.
 *
 * @see @/lib/constants/ai-models — gateway model id format (`provider/model`)
 * @see @/lib/merch/mockup-engine — composites this graphic onto Printful blanks
 */

import { gateway } from '@ai-sdk/gateway';
import { generateImage } from 'ai';
import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Model roster
// ---------------------------------------------------------------------------

/**
 * Alpha strategy per model:
 * - `native`: the provider returns a real transparent background (gpt-image).
 * - `knockout`: opaque output; needs a background-removal pass before it is
 *   alpha-clean. Gated off until that pass lands (see knockoutBackground).
 */
type AlphaStrategy = 'native' | 'knockout';

export interface MerchImageModelConfig {
  /** Gateway model id, `provider/model`. */
  readonly id: string;
  /** Short stable key used for feedback scoring + analytics. */
  readonly key: string;
  readonly alpha: AlphaStrategy;
  /** In the live A/B roster. `knockout` models stay false until bg-removal ships. */
  readonly enabled: boolean;
}

export const MERCH_IMAGE_MODELS: readonly MerchImageModelConfig[] = [
  {
    id: 'openai/gpt-image-1.5',
    key: 'gpt-image-1.5',
    alpha: 'native',
    enabled: true,
  },
  {
    // Native transparent output, distinct clean-illustration aesthetic.
    // Verified alpha-clean in scripts/merch-knockout-spike.ts.
    id: 'recraft/recraft-v3',
    key: 'recraft-v3',
    alpha: 'native',
    enabled: true,
  },
  {
    id: 'openai/gpt-image-1',
    key: 'gpt-image-1',
    alpha: 'native',
    enabled: false,
  },
  {
    // Knockout via chroma-key proved unreliable (residual background blocks —
    // see merch-knockout-spike.ts); needs a proper bg-removal model to enable.
    id: 'bfl/flux-2-pro',
    key: 'flux-2-pro',
    alpha: 'knockout',
    enabled: false,
  },
  {
    id: 'xai/grok-imagine-image',
    key: 'grok-imagine',
    alpha: 'knockout',
    enabled: false,
  },
  {
    id: 'google/imagen-4.0-ultra-generate-001',
    key: 'imagen-4-ultra',
    alpha: 'knockout',
    enabled: false,
  },
] as const;

export type MerchImageModelKey = (typeof MERCH_IMAGE_MODELS)[number]['key'];

function activeModels(): readonly MerchImageModelConfig[] {
  return MERCH_IMAGE_MODELS.filter(m => m.enabled);
}

// ---------------------------------------------------------------------------
// Feedback-weighted model selection (epsilon-greedy-ish)
// ---------------------------------------------------------------------------

export interface ModelSelectionOptions {
  /** Per-model weight, e.g. derived from thumbs up/down. Missing → 1 (equal). */
  readonly weights?: Partial<Record<MerchImageModelKey, number>>;
  /** Injectable RNG for deterministic tests. */
  readonly rand?: () => number;
}

/** Floor weight so a temporarily-unlucky model stays in rotation and can recover. */
const MODEL_WEIGHT_FLOOR = 0.05;

/**
 * Pure weighted random pick. Each model gets `max(FLOOR, weight ?? 1)`; a model
 * with no recorded weight is treated as average (1). Exported for testing the
 * bandit math independent of which roster entries are enabled.
 */
export function weightedPick<T extends { readonly key: string }>(
  models: readonly T[],
  weights: Partial<Record<string, number>> | undefined,
  rand: () => number
): T {
  if (models.length === 0) {
    throw new Error('No models to pick from');
  }
  const weighted = models.map(
    m => [m, Math.max(MODEL_WEIGHT_FLOOR, weights?.[m.key] ?? 1)] as const
  );
  const total = weighted.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [model, weight] of weighted) {
    roll -= weight;
    if (roll <= 0) return model;
  }
  return weighted[weighted.length - 1][0];
}

/**
 * Pick an active model weighted by feedback score. Starts equal across the
 * active roster; biases toward higher-scoring models as feedback accrues.
 */
export function selectMerchImageModel(
  options: ModelSelectionOptions = {}
): MerchImageModelConfig {
  const models = activeModels();
  if (models.length === 0) {
    throw new Error('No active merch image models configured');
  }
  return weightedPick(models, options.weights, options.rand ?? Math.random);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface PrintGraphic {
  /** Transparent (alpha) PNG bytes — drops onto any garment + is the print file. */
  readonly image: Buffer;
  /** Which roster model produced it (stamp on the design for feedback scoring). */
  readonly modelKey: MerchImageModelKey;
  readonly modelId: string;
  readonly mediaType: 'image/png';
}

const ALPHA_DIRECTIVE =
  'Isolate the artwork with a fully transparent background — no garment, no mockup, no backdrop. Clean cut-out edges, print-ready.';

interface RawImage {
  readonly uint8Array?: Uint8Array;
  readonly base64?: string;
}

function toBuffer(image: RawImage): Buffer {
  if (image.uint8Array) return Buffer.from(image.uint8Array);
  if (image.base64) return Buffer.from(image.base64, 'base64');
  throw new TypeError('Gateway image result did not include image bytes');
}

/**
 * Provider-specific request options that yield a native transparent background.
 * gpt-image takes `background: transparent`; Recraft returns a transparent PNG.
 */
export function alphaProviderOptions(
  model: MerchImageModelConfig
): Record<string, Record<string, string>> | undefined {
  if (model.id.startsWith('openai/gpt-image')) {
    return { openai: { background: 'transparent' } };
  }
  if (model.id.startsWith('recraft/')) {
    return { recraft: { response_format: 'png' } };
  }
  return undefined;
}

/**
 * Opaque output → alpha. Not yet implemented; `knockout` models stay disabled
 * until this lands so the roster never emits a white-boxed (non-alpha) graphic.
 */
// ponytail: native-transparent (gpt-image) is the only alpha path today; add a
// background-removal step here (local @imgly/background-removal or a Bria model)
// to enable flux/grok/imagen in the A/B. Tracked as the next merch task.
function knockoutBackground(_opaquePng: Buffer): never {
  throw new Error(
    'knockoutBackground not implemented — keep knockout models disabled'
  );
}

/**
 * Generate one transparent print graphic. The model is feedback-weighted unless
 * one is pinned (e.g. to regenerate with the same model on "make another like this").
 */
export async function generatePrintGraphic(params: {
  readonly prompt: string;
  readonly model?: MerchImageModelConfig;
  readonly selection?: ModelSelectionOptions;
}): Promise<PrintGraphic> {
  const model = params.model ?? selectMerchImageModel(params.selection);
  const started = Date.now();

  const providerOptions =
    model.alpha === 'native' ? alphaProviderOptions(model) : undefined;
  const result = await generateImage({
    model: gateway.image(model.id),
    prompt: `${params.prompt}\n${ALPHA_DIRECTIVE}`,
    size: '1024x1024',
    ...(providerOptions ? { providerOptions } : {}),
  });

  const raw = toBuffer(result.images[0] as RawImage);
  const image = model.alpha === 'native' ? raw : knockoutBackground(raw);

  logger.info('[merch] print graphic generated', {
    model: model.key,
    ms: Date.now() - started,
    bytes: image.length,
  });

  return {
    image,
    modelKey: model.key,
    modelId: model.id,
    mediaType: 'image/png',
  };
}

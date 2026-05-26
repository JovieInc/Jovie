import 'server-only';

import { xai } from '@ai-sdk/xai';
import { generateImage } from 'ai';
import { env } from '@/lib/env-server';

export { buildAlbumArtBackgroundPrompt } from './prompts';

const DEFAULT_MODEL = 'grok-imagine-image';

/**
 * Thrown when XAI_API_KEY is not configured. This is an *expected operational
 * state* (provider key not provisioned in an env), not an application error.
 * Callers should treat it as `feature_disabled` and skip Sentry capture.
 */
export class XaiApiKeyMissingError extends Error {
  readonly code = 'XAI_API_KEY_MISSING' as const;
  constructor(message = 'XAI_API_KEY is not configured') {
    super(message);
    this.name = 'XaiApiKeyMissingError';
  }
}

export function isXaiConfigured(): boolean {
  return Boolean(env.XAI_API_KEY?.trim());
}

function getAlbumArtModelId(): string {
  return env.ALBUM_ART_IMAGE_MODEL ?? DEFAULT_MODEL;
}

function bufferFromImage(image: unknown): Buffer {
  const candidate = image as {
    readonly uint8Array?: Uint8Array;
    readonly base64?: string;
  };

  if (candidate.uint8Array) {
    return Buffer.from(candidate.uint8Array);
  }
  if (candidate.base64) {
    return Buffer.from(candidate.base64, 'base64');
  }
  throw new TypeError('xAI image result did not include image bytes');
}

export async function generateAlbumArtBackgrounds(params: {
  readonly prompt: string;
}): Promise<{
  readonly model: string;
  readonly images: readonly Buffer[];
}> {
  if (!isXaiConfigured()) {
    throw new XaiApiKeyMissingError();
  }
  const model = getAlbumArtModelId();
  const result = await generateImage({
    model: xai.image(model),
    prompt: params.prompt,
    aspectRatio: '1:1',
    n: 3,
  });

  return {
    model,
    images: (result.images as readonly unknown[]).map(bufferFromImage),
  };
}

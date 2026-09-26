import 'server-only';

import { GatewayAuthenticationError } from '@ai-sdk/gateway';
import { generateImage } from 'ai';
import { isAiGatewayAvailable } from '@/lib/ai/gateway-availability';
import { gateway } from '@/lib/ai/sdk';
import { ALBUM_ART_GATEWAY_IMAGE_MODEL } from '@/lib/constants/ai-models';
import { env } from '@/lib/env-server';

export { buildAlbumArtBackgroundPrompt } from './prompts';

/**
 * Thrown when AI Gateway auth is not configured or rejected. This is an
 * *expected operational state* (gateway auth not provisioned in an env), not
 * an application error. Callers should treat it as `feature_disabled` and
 * skip Sentry capture.
 */
export class AlbumArtGatewayUnconfiguredError extends Error {
  readonly code = 'ALBUM_ART_GATEWAY_UNCONFIGURED' as const;
  constructor(message = 'AI Gateway authentication is not configured') {
    super(message);
    this.name = 'AlbumArtGatewayUnconfiguredError';
  }
}

export function isAlbumArtGatewayConfigured(): boolean {
  // The AI Gateway SDK resolves Vercel OIDC through @vercel/oidc at request
  // time; do not probe VERCEL_OIDC_TOKEN directly here.
  return isAiGatewayAvailable({ apiKey: env.AI_GATEWAY_API_KEY });
}

function getAlbumArtModelId(): string {
  const override = env.ALBUM_ART_IMAGE_MODEL?.trim();
  // Legacy bare ids (for example `grok-imagine-image`) are direct-xAI slugs.
  // Ignore them so a stale override cannot bypass the Gateway model string.
  if (override?.includes('/')) {
    return override;
  }
  return ALBUM_ART_GATEWAY_IMAGE_MODEL;
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
  throw new TypeError('Gateway image result did not include image bytes');
}

export async function generateAlbumArtBackgrounds(params: {
  readonly prompt: string;
}): Promise<{
  readonly model: string;
  readonly images: readonly Buffer[];
}> {
  if (!isAlbumArtGatewayConfigured()) {
    throw new AlbumArtGatewayUnconfiguredError();
  }
  const model = getAlbumArtModelId();
  try {
    const result = await generateImage({
      model: gateway.image(model),
      prompt: params.prompt,
      aspectRatio: '1:1',
      n: 3,
    });

    return {
      model,
      images: (result.images as readonly unknown[]).map(bufferFromImage),
    };
  } catch (error) {
    if (GatewayAuthenticationError.isInstance(error)) {
      throw new AlbumArtGatewayUnconfiguredError();
    }
    throw error;
  }
}

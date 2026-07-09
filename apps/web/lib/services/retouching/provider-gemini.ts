import 'server-only';

import { gateway, generateText } from '@/lib/ai/sdk';
import { env } from '@/lib/env-server';

/**
 * Retouch image provider — Gemini image editing via the Vercel AI Gateway.
 *
 * Mirrors the album-art provider pattern (provider-xai.ts): a small module
 * that owns the model call, a config check, and typed operational errors.
 * The model is a language model that returns edited images as generated
 * files on the generateText result (image-in -> image-out editing).
 *
 * Routed through the @/lib/ai/sdk chokepoint per the telemetry contract —
 * no standalone Google API key (Tim, 2026-06-20).
 */

/** Gateway slug — matches SKILL_REGISTRY.retouch.model. */
export const RETOUCH_MODEL_ID = 'google/gemini-2.5-flash-image';

/**
 * Thrown when AI_GATEWAY_API_KEY is not configured. This is an *expected
 * operational state* (gateway key not provisioned in an env), not an
 * application error. Callers should treat it as provider-unavailable and
 * skip Sentry capture.
 */
export class RetouchGatewayUnconfiguredError extends Error {
  readonly code = 'RETOUCH_GATEWAY_UNCONFIGURED' as const;
  constructor(message = 'AI_GATEWAY_API_KEY is not configured') {
    super(message);
    this.name = 'RetouchGatewayUnconfiguredError';
  }
}

/**
 * Thrown when the model responds without an image — typically a safety
 * refusal per the white-space.md guardrails (low-quality input, identity
 * ambiguity). The model's text response is preserved for the job error
 * column; never shown to users verbatim.
 */
export class RetouchNoImageReturnedError extends Error {
  readonly code = 'RETOUCH_NO_IMAGE_RETURNED' as const;
  readonly modelText: string;
  constructor(modelText: string) {
    super('Retouch model returned no image');
    this.name = 'RetouchNoImageReturnedError';
    this.modelText = modelText;
  }
}

export function isRetouchConfigured(): boolean {
  return Boolean(env.AI_GATEWAY_API_KEY?.trim());
}

export interface RetouchModelResult {
  readonly image: Buffer;
  readonly mediaType: string;
  readonly model: string;
  /** Raw token usage from the model response (persisted to retouch_jobs). */
  readonly tokenUsage: Record<string, unknown>;
}

/**
 * Runs one image-editing call: source image + style prompt in, edited image
 * out. The source image is passed by URL (chat attachments are public
 * Vercel Blob URLs) so the gateway fetches bytes directly.
 */
export async function runRetouchModel(params: {
  readonly sourceImageUrl: string;
  readonly prompt: string;
}): Promise<RetouchModelResult> {
  if (!isRetouchConfigured()) {
    throw new RetouchGatewayUnconfiguredError();
  }

  const result = await generateText({
    model: gateway(RETOUCH_MODEL_ID),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: params.prompt },
          { type: 'image', image: new URL(params.sourceImageUrl) },
        ],
      },
    ],
  });

  const imageFile = result.files.find(file =>
    file.mediaType?.startsWith('image/')
  );

  if (!imageFile) {
    throw new RetouchNoImageReturnedError(result.text?.slice(0, 500) ?? '');
  }

  return {
    image: Buffer.from(imageFile.uint8Array),
    mediaType: imageFile.mediaType,
    model: RETOUCH_MODEL_ID,
    tokenUsage: toPlainTokenUsage(result.usage),
  };
}

function toPlainTokenUsage(usage: unknown): Record<string, unknown> {
  if (typeof usage !== 'object' || usage === null) {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(usage)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

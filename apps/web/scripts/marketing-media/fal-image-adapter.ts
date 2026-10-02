/**
 * fal implementation of the marketing image adapter (JOV-7250).
 *
 * FAL_KEY is read from Doppler at call time and never stored. Without it the
 * adapter returns `credentials-unavailable` and makes no network call. The
 * key never appears in a result, a reason string or a log line.
 */

import { type RuntimeSecret, readDopplerSecret } from './credentials';
import type {
  ImageGenerationAdapter,
  ImageGenerationOutcome,
  ImageGenerationRequest,
} from './image-adapter';

export const FAL_KEY_SECRET = 'FAL_KEY';
export const FAL_DEFAULT_MODEL = 'fal-ai/flux-2-pro';
export const FAL_RUN_BASE_URL = 'https://fal.run';

type FetchLike = (
  url: string,
  init?: {
    readonly method?: string;
    readonly headers?: Record<string, string>;
    readonly body?: string;
  }
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
  readonly headers?: { get(name: string): string | null };
}>;

export interface FalImageAdapterOptions {
  readonly model?: string;
  readonly readSecret?: () => RuntimeSecret;
  readonly fetchImpl?: FetchLike;
}

interface FalImage {
  readonly url: string;
  readonly width?: number;
  readonly height?: number;
  readonly content_type?: string;
}

function firstImage(payload: unknown): FalImage | null {
  if (!payload || typeof payload !== 'object') return null;
  const images = (payload as { images?: unknown }).images;
  if (!Array.isArray(images) || images.length === 0) return null;
  const image = images[0] as Partial<FalImage> | null;
  return image && typeof image.url === 'string' ? (image as FalImage) : null;
}

export function createFalImageAdapter(
  options: FalImageAdapterOptions = {}
): ImageGenerationAdapter {
  const model = options.model ?? FAL_DEFAULT_MODEL;
  const readSecret =
    options.readSecret ?? (() => readDopplerSecret(FAL_KEY_SECRET));
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const provider = 'fal';

  return {
    provider,
    model,
    family: model.includes('flux') ? 'bfl' : 'fal',
    async generate(
      request: ImageGenerationRequest
    ): Promise<ImageGenerationOutcome> {
      const secret = readSecret();
      if (!secret.ok) {
        return {
          status: 'credentials-unavailable',
          provider,
          reason: secret.reason,
        };
      }

      try {
        const response = await fetchImpl(`${FAL_RUN_BASE_URL}/${model}`, {
          method: 'POST',
          headers: {
            Authorization: `Key ${secret.value}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: request.prompt,
            image_size: { width: request.width, height: request.height },
            num_images: 1,
            output_format: 'png',
            enable_safety_checker: true,
          }),
        });
        if (!response.ok) {
          return {
            status: 'failed',
            provider,
            reason: `fal ${model} returned HTTP ${response.status}`,
          };
        }
        const image = firstImage(await response.json());
        if (!image) {
          return {
            status: 'failed',
            provider,
            reason: `fal ${model} returned no image`,
          };
        }
        const download = await fetchImpl(image.url);
        if (!download.ok) {
          return {
            status: 'failed',
            provider,
            reason: `fal image download returned HTTP ${download.status}`,
          };
        }
        return {
          status: 'generated',
          provider,
          model,
          bytes: new Uint8Array(await download.arrayBuffer()),
          mime: image.content_type ?? 'image/png',
          width: image.width ?? request.width,
          height: image.height ?? request.height,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          status: 'failed',
          provider,
          reason: `fal request failed: ${message.split(secret.value).join('[redacted]')}`,
        };
      }
    },
  };
}

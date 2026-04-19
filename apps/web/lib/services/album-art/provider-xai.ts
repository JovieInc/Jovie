import 'server-only';

import { xai } from '@ai-sdk/xai';
import { generateImage } from 'ai';
import { env } from '@/lib/env-server';
import type { AlbumArtStylePreset } from './types';

const DEFAULT_MODEL = 'grok-imagine-image';

function getAlbumArtModelId(): string {
  return env.ALBUM_ART_IMAGE_MODEL ?? DEFAULT_MODEL;
}

export function buildAlbumArtBackgroundPrompt(params: {
  readonly releaseTitle: string;
  readonly artistName: string;
  readonly style: AlbumArtStylePreset;
  readonly prompt?: string;
}): string {
  const customPrompt = params.prompt?.trim();
  return [
    'Create a square album cover background image.',
    params.style.backgroundPrompt,
    customPrompt ? `Additional direction: ${customPrompt}` : null,
    'Do not render any words, letters, typography, logos, label names, advisory stickers, watermarks, symbols that resemble text, or UI elements.',
    'Leave clean composition space for Jovie to overlay the artist name and release title later.',
    `Mood should fit a release called "${params.releaseTitle}" by ${params.artistName}.`,
  ]
    .filter(Boolean)
    .join(' ');
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

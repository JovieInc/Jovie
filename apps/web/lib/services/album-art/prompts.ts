import type { AlbumArtStylePreset } from './types';

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

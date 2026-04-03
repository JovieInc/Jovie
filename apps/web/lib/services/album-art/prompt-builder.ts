import type { GenerateAlbumArtInput } from './types';

export function buildAlbumArtPrompt(input: GenerateAlbumArtInput): string {
  const genres = (input.genres ?? []).slice(0, 2).join(', ');
  const genreLine = genres ? `Genres: ${genres}. ` : '';

  return [
    `Create a square album cover background for the release "${input.title}" by ${input.artistName}.`,
    `Release type: ${input.releaseType}.`,
    genreLine,
    'The image must be text-free and logo-free.',
    'Do not include letters, words, typography, artist names, titles, watermarks, or branding marks.',
    'Design for a premium music cover with strong composition, clear focal shapes, and room for typography overlay.',
    'Use abstract, graphic, cinematic, or photographic art direction that feels cover-art ready.',
  ]
    .join(' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

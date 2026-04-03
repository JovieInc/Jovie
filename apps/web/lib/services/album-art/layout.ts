import type {
  AlbumArtLayoutPreset,
  AlbumArtLogoPosition,
  ParsedAlbumArtTitle,
} from './types';

export interface AlbumArtLayout {
  readonly preset: AlbumArtLayoutPreset;
  readonly titleLines: readonly string[];
  readonly titleFontSize: number;
  readonly artistFontSize: number;
  readonly versionFontSize: number;
  readonly logoSize: number;
  readonly logoPosition: AlbumArtLogoPosition | null;
}

function splitTitleLines(value: string, maxLineLength: number): string[] {
  if (value.length <= maxLineLength) {
    return [value];
  }

  const words = value.split(/\s+/u);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLineLength && current) {
      lines.push(current);
      current = word;
      continue;
    }
    current = candidate;
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, 2);
}

export function buildAlbumArtLayout(params: {
  readonly preset?: AlbumArtLayoutPreset;
  readonly parsedTitle: ParsedAlbumArtTitle;
  readonly logoPosition?: AlbumArtLogoPosition | null;
}): AlbumArtLayout {
  const preset = params.preset ?? 'v1-title-artist-version';
  const titleLength = params.parsedTitle.displayTitle.length;
  const titleFontSize = titleLength > 42 ? 196 : titleLength > 28 ? 236 : 278;
  const artistFontSize = titleLength > 42 ? 86 : titleLength > 28 ? 94 : 104;
  const versionFontSize = params.parsedTitle.versionLabel ? 78 : 0;

  return {
    preset,
    titleLines: splitTitleLines(
      params.parsedTitle.baseTitle,
      titleLength > 42 ? 18 : 14
    ),
    titleFontSize,
    artistFontSize,
    versionFontSize,
    logoSize: 312,
    logoPosition: params.logoPosition ?? null,
  };
}

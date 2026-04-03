import type { ParsedAlbumArtTitle } from './types';

const VERSION_SUFFIXES = [
  'extended mix',
  'radio edit',
  'vip mix',
  'instrumental',
  'acapella',
  'club mix',
  'dub mix',
  'extended version',
  'radio version',
  'remix',
  'mix',
  'edit',
  'version',
  'vip',
  'dub',
  'club',
  'rework',
  'refix',
  'live',
  'demo',
] as const;

function normalizeWhitespace(value: string): string {
  return value.replaceAll(/\s+/g, ' ').trim();
}

function normalizeBaseTitle(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim();
}

function looksLikeVersionLabel(value: string): boolean {
  const normalized = normalizeWhitespace(value).toLowerCase();
  return VERSION_SUFFIXES.some(
    suffix => normalized === suffix || normalized.endsWith(` ${suffix}`)
  );
}

export function parseAlbumArtTitle(title: string): ParsedAlbumArtTitle {
  const displayTitle = normalizeWhitespace(title);
  const bracketMatch = displayTitle.match(
    /^(.*?)[\s]*[\(\[]([^\)\]]+)[\)\]]$/u
  );
  if (bracketMatch && looksLikeVersionLabel(bracketMatch[2] ?? '')) {
    const baseTitle = normalizeWhitespace(bracketMatch[1] ?? displayTitle);
    const versionLabel = normalizeWhitespace(bracketMatch[2] ?? '');
    return {
      displayTitle,
      baseTitle,
      normalizedBaseTitle: normalizeBaseTitle(baseTitle),
      versionLabel,
    };
  }

  const dashMatch = displayTitle.match(/^(.*?)[\s]+-[\s]+(.+)$/u);
  if (dashMatch && looksLikeVersionLabel(dashMatch[2] ?? '')) {
    const baseTitle = normalizeWhitespace(dashMatch[1] ?? displayTitle);
    const versionLabel = normalizeWhitespace(dashMatch[2] ?? '');
    return {
      displayTitle,
      baseTitle,
      normalizedBaseTitle: normalizeBaseTitle(baseTitle),
      versionLabel,
    };
  }

  return {
    displayTitle,
    baseTitle: displayTitle,
    normalizedBaseTitle: normalizeBaseTitle(displayTitle),
    versionLabel: null,
  };
}

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
  const whitespaceNormalized = normalizeWhitespace(value);
  const normalized = whitespaceNormalized
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

  return normalized || whitespaceNormalized.toLowerCase();
}

function looksLikeVersionLabel(value: string): boolean {
  const normalized = normalizeWhitespace(value).toLowerCase();
  return VERSION_SUFFIXES.some(
    suffix => normalized === suffix || normalized.endsWith(` ${suffix}`)
  );
}

function parseBracketSuffix(
  displayTitle: string
): { readonly baseTitle: string; readonly versionLabel: string } | null {
  const closingCharacter = displayTitle.at(-1);
  if (closingCharacter !== ')' && closingCharacter !== ']') {
    return null;
  }

  const openingCharacter = closingCharacter === ')' ? '(' : '[';
  const openingIndex = displayTitle.lastIndexOf(openingCharacter);
  if (openingIndex <= 0) {
    return null;
  }

  const versionLabel = normalizeWhitespace(
    displayTitle.slice(openingIndex + 1, -1)
  );
  if (!versionLabel || !looksLikeVersionLabel(versionLabel)) {
    return null;
  }

  const baseTitle = normalizeWhitespace(displayTitle.slice(0, openingIndex));
  if (!baseTitle) {
    return null;
  }

  return {
    baseTitle,
    versionLabel,
  };
}

function parseDashSuffix(
  displayTitle: string
): { readonly baseTitle: string; readonly versionLabel: string } | null {
  const separator = ' - ';
  const separatorIndex = displayTitle.lastIndexOf(separator);
  if (separatorIndex <= 0) {
    return null;
  }

  const baseTitle = normalizeWhitespace(displayTitle.slice(0, separatorIndex));
  const versionLabel = normalizeWhitespace(
    displayTitle.slice(separatorIndex + separator.length)
  );
  if (!baseTitle || !versionLabel || !looksLikeVersionLabel(versionLabel)) {
    return null;
  }

  return {
    baseTitle,
    versionLabel,
  };
}

export function parseAlbumArtTitle(title: string): ParsedAlbumArtTitle {
  const displayTitle = normalizeWhitespace(title);
  const bracketSuffix = parseBracketSuffix(displayTitle);
  if (bracketSuffix) {
    return {
      displayTitle,
      baseTitle: bracketSuffix.baseTitle,
      normalizedBaseTitle: normalizeBaseTitle(bracketSuffix.baseTitle),
      versionLabel: bracketSuffix.versionLabel,
    };
  }

  const dashSuffix = parseDashSuffix(displayTitle);
  if (dashSuffix) {
    return {
      displayTitle,
      baseTitle: dashSuffix.baseTitle,
      normalizedBaseTitle: normalizeBaseTitle(dashSuffix.baseTitle),
      versionLabel: dashSuffix.versionLabel,
    };
  }

  return {
    displayTitle,
    baseTitle: displayTitle,
    normalizedBaseTitle: normalizeBaseTitle(displayTitle),
    versionLabel: null,
  };
}

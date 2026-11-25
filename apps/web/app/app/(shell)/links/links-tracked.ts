import {
  buildUTMUrl,
  getDefaultQuickPresets,
  type UTMContext,
  type UTMPreset,
} from '@/lib/utm';
import type { LinkRow } from './links-model';

/**
 * Audience short links (`/s/{code}`) already carry campaign UTMs on redirect.
 * Profile, release, and social rows need a preset applied at copy time.
 */
export function isAudienceSourceLinkRow(row: Pick<LinkRow, 'id'>): boolean {
  return row.id.startsWith('source-');
}

/**
 * Campaign slug for UTM placeholder resolution. Prefer the last path segment
 * of the Jovie URL (release slug, handle, or short code).
 */
export function deriveLinksCampaignSlug(
  row: Pick<LinkRow, 'jovieUrl' | 'title'>
): string {
  try {
    const parts = new URL(row.jovieUrl).pathname.split('/').filter(Boolean);
    const last = parts.at(-1);
    if (last) return last;
  } catch {
    // Fall through to title when the URL is malformed in tests/fixtures.
  }
  return row.title.trim().toLowerCase().replaceAll(/\s+/g, '-') || 'link';
}

export function buildLinksUtmContext(
  row: Pick<LinkRow, 'jovieUrl' | 'title'>
): UTMContext {
  return {
    baseUrl: row.jovieUrl,
    releaseSlug: deriveLinksCampaignSlug(row),
    releaseTitle: row.title,
  };
}

export function getLinksDefaultTrackedPreset(): UTMPreset | null {
  return getDefaultQuickPresets()[0] ?? null;
}

/**
 * One-tap tracked URL for a Links row.
 * Source rows copy the existing `/s` URL; entity rows apply the default quick
 * UTM preset (Instagram Story) without minting a second shortener.
 */
export function buildOneTapTrackedUrl(
  row: Pick<LinkRow, 'id' | 'jovieUrl' | 'title'>
): { readonly url: string; readonly presetLabel: string | null } {
  if (isAudienceSourceLinkRow(row)) {
    return { url: row.jovieUrl, presetLabel: null };
  }

  const preset = getLinksDefaultTrackedPreset();
  if (!preset) {
    return { url: row.jovieUrl, presetLabel: null };
  }

  const result = buildUTMUrl({
    url: row.jovieUrl,
    params: preset.params,
    context: buildLinksUtmContext(row),
  });
  return { url: result.url, presetLabel: preset.label };
}

import type { CommonDropdownItem } from '@jovie/ui';
import {
  buildTrackedShareDropdownItems,
  groupTrackedPresetsBySource,
} from '@/lib/share/tracked-sources';
import type { UTMPreset } from '@/lib/utm';
import { ALL_UTM_PRESETS, buildUTMContext } from '@/lib/utm';

interface BuildProfileShareDropdownItemsParams {
  readonly profileUrl: string;
  readonly campaignSlug: string;
  readonly artistName?: string;
  readonly onCopy: (url: string, label: string) => void;
}

/**
 * Platforms shown in the profile tracked-link builder, ordered by category.
 * Organic social -> music -> paid -> email/pr -> other.
 */
const PROFILE_SHARE_SOURCE_ORDER = [
  'instagram',
  'tiktok',
  'youtube',
  'twitter',
  'facebook',
  'threads',
  'discord',
  'spotify',
  'apple_music',
  'soundcloud',
  'bandcamp',
  'meta',
  'google',
  'newsletter',
  'email_blast',
  'pr',
  'website',
  'podcast',
  'qr_code',
] as const;

const PROFILE_SHARE_SOURCES = new Set<string>(PROFILE_SHARE_SOURCE_ORDER);

export function groupPresetsByPlatform(presets: readonly UTMPreset[]): Array<{
  readonly source: string;
  readonly label: string;
  readonly presets: readonly UTMPreset[];
}> {
  return groupTrackedPresetsBySource(
    presets.filter(
      preset =>
        preset.params.utm_source &&
        PROFILE_SHARE_SOURCES.has(preset.params.utm_source)
    )
  ).map(group => ({
    source: group.source,
    label: group.label,
    presets: group.presets,
  }));
}

export function buildProfileShareDropdownItems({
  profileUrl,
  campaignSlug,
  artistName,
  onCopy,
}: BuildProfileShareDropdownItemsParams): CommonDropdownItem[] {
  return buildTrackedShareDropdownItems({
    baseUrl: profileUrl,
    context: buildUTMContext({
      smartLinkUrl: profileUrl,
      releaseSlug: campaignSlug,
      releaseTitle: campaignSlug,
      artistName,
    }),
    onCopy,
    allowedSources: PROFILE_SHARE_SOURCE_ORDER,
    sourceOrder: PROFILE_SHARE_SOURCE_ORDER,
    rootLabel: 'UTM Builder',
  });
}

export const PROFILE_TRACKED_PRESETS = ALL_UTM_PRESETS.filter(
  preset =>
    preset.params.utm_source &&
    PROFILE_SHARE_SOURCES.has(preset.params.utm_source)
);

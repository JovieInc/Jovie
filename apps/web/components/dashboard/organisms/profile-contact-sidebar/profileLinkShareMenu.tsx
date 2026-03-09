import type { CommonDropdownItem } from '@jovie/ui';
import type { LucideIcon } from 'lucide-react';
import {
  Globe,
  Headphones,
  Link2,
  Mail,
  Newspaper,
  QrCode,
  Search,
  Send,
  Share2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { buildUTMUrl, type UTMPreset } from '@/lib/utm';
import { ALL_UTM_PRESETS } from '@/lib/utm/presets';

interface BuildProfileShareDropdownItemsParams {
  readonly profileUrl: string;
  readonly campaignSlug: string;
  readonly artistName?: string;
  readonly onCopy: (url: string, label: string) => void;
}

interface PresetGroup {
  readonly source: string;
  readonly label: string;
  readonly presets: readonly UTMPreset[];
}

/**
 * Platforms shown in the profile UTM share dropdown, ordered by category.
 * The array order determines display order — grouped as:
 * Organic Social → Music → Paid → Email/PR → Other
 *
 * Intentionally excludes niche sources and competing link aggregators (e.g. Linktree).
 */
const PROFILE_SHARE_SOURCE_ORDER = [
  // Organic Social
  'instagram',
  'tiktok',
  'youtube',
  'twitter',
  'facebook',
  'threads',
  'discord',
  // Music Platforms
  'spotify',
  'apple_music',
  'soundcloud',
  'bandcamp',
  // Paid
  'meta',
  'google',
  // Email & PR
  'newsletter',
  'email_blast',
  'pr',
  // Other
  'website',
  'podcast',
  'qr_code',
] as const;

const PROFILE_SHARE_SOURCES = new Set<string>(PROFILE_SHARE_SOURCE_ORDER);

/** Maps utm_source values to SocialIcon platform keys for brand icons */
const SOCIAL_ICON_MAP: Record<string, string> = {
  instagram: 'instagram',
  tiktok: 'tiktok',
  twitter: 'x',
  facebook: 'facebook',
  youtube: 'youtube',
  spotify: 'spotify',
  apple_music: 'apple_music',
  threads: 'threads',
  discord: 'discord',
  soundcloud: 'soundcloud',
  bandcamp: 'bandcamp',
  meta: 'facebook',
};

/** Lucide icon fallbacks for non-brand sources */
const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
  newsletter: Mail,
  email_blast: Send,
  pr: Newspaper,
  google: Search,
  qr_code: QrCode,
  website: Globe,
  podcast: Headphones,
};

function getIconForSource(source: string): LucideIcon | ReactNode {
  const socialPlatform = SOCIAL_ICON_MAP[source];
  if (socialPlatform) {
    return <SocialIcon platform={socialPlatform} className='h-4 w-4' />;
  }
  return LUCIDE_ICON_MAP[source] ?? Link2;
}

function formatPlatformName(source: string): string {
  return source
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function groupPresetsByPlatform(
  presets: readonly UTMPreset[]
): PresetGroup[] {
  const grouped = new Map<string, UTMPreset[]>();

  for (const preset of presets) {
    const source = preset.params.utm_source?.trim();
    if (!source) continue;

    const current = grouped.get(source) ?? [];
    current.push(preset);
    grouped.set(source, current);
  }

  return Array.from(grouped.entries())
    .map(([source, sourcePresets]) => ({
      source,
      label: formatPlatformName(source),
      presets: sourcePresets.toSorted((a, b) => a.label.localeCompare(b.label)),
    }))
    .toSorted((a, b) => a.label.localeCompare(b.label));
}

export function buildProfileShareDropdownItems({
  profileUrl,
  campaignSlug,
  artistName,
  onCopy,
}: BuildProfileShareDropdownItemsParams): CommonDropdownItem[] {
  const filteredPresets = ALL_UTM_PRESETS.filter(
    p => p.params.utm_source && PROFILE_SHARE_SOURCES.has(p.params.utm_source)
  );
  const groupedPlatforms = groupPresetsByPlatform(filteredPresets);

  // Sort by category order (organic social → music → paid → email/PR → other)
  const sourceIndex = new Map<string, number>(
    PROFILE_SHARE_SOURCE_ORDER.map((s, i) => [s, i])
  );
  groupedPlatforms.sort(
    (a, b) =>
      (sourceIndex.get(a.source) ?? 999) - (sourceIndex.get(b.source) ?? 999)
  );

  // Category boundaries — insert separators between groups
  const CATEGORY_BOUNDARIES = new Set([
    'spotify',
    'meta',
    'newsletter',
    'website',
  ]);

  const items: CommonDropdownItem[] = [];
  for (const platform of groupedPlatforms) {
    if (items.length > 0 && CATEGORY_BOUNDARIES.has(platform.source)) {
      items.push({ type: 'separator', id: `sep-before-${platform.source}` });
    }

    const icon = getIconForSource(platform.source);

    if (platform.presets.length === 1) {
      const [preset] = platform.presets;
      items.push({
        type: 'action',
        id: `profile-utm-${preset.id}`,
        label: platform.label,
        icon,
        onClick: () => {
          const result = buildUTMUrl({
            url: profileUrl,
            params: preset.params,
            context: {
              releaseSlug: campaignSlug,
              artistName,
              releaseTitle: campaignSlug,
            },
          });
          onCopy(result.url, preset.label);
        },
      });
    } else {
      items.push({
        type: 'submenu',
        id: `profile-utm-group-${platform.source}`,
        label: platform.label,
        icon,
        items: platform.presets.map(preset => ({
          type: 'action' as const,
          id: `profile-utm-${preset.id}`,
          label: preset.label,
          onClick: () => {
            const result = buildUTMUrl({
              url: profileUrl,
              params: preset.params,
              context: {
                releaseSlug: campaignSlug,
                artistName,
                releaseTitle: campaignSlug,
              },
            });
            onCopy(result.url, preset.label);
          },
        })),
      });
    }
  }

  return [
    {
      type: 'submenu',
      id: 'profile-utm-share-submenu',
      label: 'UTM Builder',
      icon: Share2,
      items,
    },
  ];
}

import type { CommonDropdownItem } from '@jovie/ui';
import { Link2, Share2 } from 'lucide-react';
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
  const groupedPlatforms = groupPresetsByPlatform(ALL_UTM_PRESETS);

  return [
    {
      type: 'submenu',
      id: 'profile-utm-share-submenu',
      label: 'UTM Builder',
      icon: Share2,
      items: groupedPlatforms.map(platform => {
        if (platform.presets.length === 1) {
          const [preset] = platform.presets;
          return {
            type: 'action' as const,
            id: `profile-utm-${preset.id}`,
            label: platform.label,
            icon: Link2,
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
          };
        }

        return {
          type: 'submenu' as const,
          id: `profile-utm-group-${platform.source}`,
          label: platform.label,
          icon: Link2,
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
        };
      }),
    },
  ];
}

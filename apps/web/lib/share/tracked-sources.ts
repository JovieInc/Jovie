import type { CommonDropdownItem } from '@jovie/ui';
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
import { createElement, type ReactNode } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import {
  ALL_UTM_PRESETS,
  buildUTMUrl,
  type UTMContext,
  type UTMPreset,
} from '@/lib/utm';
import type { TrackedShareSource, TrackedShareSourceGroup } from './types';

const SOURCE_GROUPS: readonly {
  readonly id: TrackedShareSourceGroup;
  readonly label: string;
  readonly sources: readonly string[];
}[] = [
  {
    id: 'organic_social',
    label: 'Organic Social',
    sources: [
      'instagram',
      'tiktok',
      'youtube',
      'twitter',
      'facebook',
      'threads',
      'discord',
      'reddit',
      'snapchat',
      'linkedin',
    ],
  },
  {
    id: 'music',
    label: 'Music',
    sources: [
      'spotify',
      'apple_music',
      'soundcloud',
      'bandcamp',
      'playlist_pitch',
    ],
  },
  {
    id: 'paid',
    label: 'Paid',
    sources: ['meta', 'google', 'facebook_ads', 'tiktok_ads'],
  },
  {
    id: 'email_pr',
    label: 'Email & PR',
    sources: ['newsletter', 'email_blast', 'pr'],
  },
  {
    id: 'other',
    label: 'Other',
    sources: ['website', 'podcast', 'qr_code'],
  },
] as const;

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
  linkedin: 'linkedin',
  reddit: 'reddit',
  snapchat: 'snapchat',
};

const LUCIDE_ICON_MAP = {
  newsletter: Mail,
  email_blast: Send,
  pr: Newspaper,
  google: Search,
  qr_code: QrCode,
  website: Globe,
  podcast: Headphones,
} as const;

function getSourceGroup(source: string): TrackedShareSourceGroup {
  return (
    SOURCE_GROUPS.find(group => group.sources.includes(source))?.id ?? 'other'
  );
}

function formatSourceLabel(source: string): string {
  if (source === 'apple_music') return 'Apple Music';
  if (source === 'email_blast') return 'Email Blast';
  if (source === 'qr_code') return 'QR Code';
  return source
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getTrackedShareIcon(source: string): ReactNode {
  const socialPlatform = SOCIAL_ICON_MAP[source];
  if (socialPlatform) {
    return createElement(SocialIcon, {
      platform: socialPlatform,
      className: 'h-4 w-4',
    });
  }

  const LucideIcon =
    LUCIDE_ICON_MAP[source as keyof typeof LUCIDE_ICON_MAP] ?? Link2;
  return createElement(LucideIcon, { className: 'h-4 w-4' });
}

export function getTrackedShareSources(): TrackedShareSource[] {
  return ALL_UTM_PRESETS.map(
    (preset): TrackedShareSource => ({
      id: preset.id,
      label: preset.label,
      description: preset.description,
      group: getSourceGroup(preset.params.utm_source),
      icon: preset.params.utm_source,
      utmParams: preset.params,
    })
  );
}

export function groupTrackedPresetsBySource(
  presets: readonly UTMPreset[]
): Array<{
  readonly source: string;
  readonly label: string;
  readonly group: TrackedShareSourceGroup;
  readonly presets: readonly UTMPreset[];
}> {
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
      label: formatSourceLabel(source),
      group: getSourceGroup(source),
      presets: [...sourcePresets].sort((a, b) =>
        a.label.localeCompare(b.label)
      ),
    }))
    .sort((a, b) => {
      const groupIndexA = SOURCE_GROUPS.findIndex(
        group => group.id === a.group
      );
      const groupIndexB = SOURCE_GROUPS.findIndex(
        group => group.id === b.group
      );
      if (groupIndexA !== groupIndexB) return groupIndexA - groupIndexB;
      return a.label.localeCompare(b.label);
    });
}

export function buildTrackedShareDropdownItems(params: {
  readonly baseUrl: string;
  readonly context: UTMContext;
  readonly onCopy: (url: string, label: string) => void;
  readonly allowedSources?: readonly string[];
  readonly sourceOrder?: readonly string[];
  readonly rootLabel?: string;
}): CommonDropdownItem[] {
  const allowedSourceSet = params.allowedSources
    ? new Set(params.allowedSources)
    : null;
  const groupedSources = groupTrackedPresetsBySource(
    ALL_UTM_PRESETS.filter(preset =>
      allowedSourceSet ? allowedSourceSet.has(preset.params.utm_source) : true
    )
  );
  const sourceIndex = params.sourceOrder
    ? new Map(params.sourceOrder.map((source, index) => [source, index]))
    : null;

  if (sourceIndex) {
    groupedSources.sort((left, right) => {
      const leftIndex = sourceIndex.get(left.source) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex =
        sourceIndex.get(right.source) ?? Number.MAX_SAFE_INTEGER;

      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }

      return left.label.localeCompare(right.label);
    });
  }

  const submenuItems: CommonDropdownItem[] = [];
  let previousGroup: TrackedShareSourceGroup | null = null;

  for (const sourceGroup of groupedSources) {
    if (previousGroup && previousGroup !== sourceGroup.group) {
      submenuItems.push({
        type: 'separator',
        id: `tracked-sep-${sourceGroup.source}`,
      });
    }

    previousGroup = sourceGroup.group;

    if (sourceGroup.presets.length === 1) {
      const preset = sourceGroup.presets[0];
      submenuItems.push({
        type: 'action',
        id: `tracked-${preset.id}`,
        label: sourceGroup.label,
        icon: getTrackedShareIcon(sourceGroup.source),
        onClick: () => {
          const result = buildUTMUrl({
            url: params.baseUrl,
            params: preset.params,
            context: params.context,
          });
          params.onCopy(result.url, preset.label);
        },
      });
      continue;
    }

    submenuItems.push({
      type: 'submenu',
      id: `tracked-group-${sourceGroup.source}`,
      label: sourceGroup.label,
      icon: getTrackedShareIcon(sourceGroup.source),
      items: sourceGroup.presets.map(preset => ({
        type: 'action' as const,
        id: `tracked-${preset.id}`,
        label: preset.label,
        onClick: () => {
          const result = buildUTMUrl({
            url: params.baseUrl,
            params: preset.params,
            context: params.context,
          });
          params.onCopy(result.url, preset.label);
        },
      })),
    });
  }

  return [
    {
      type: 'submenu',
      id: 'tracked-share-submenu',
      label: params.rootLabel ?? 'Tracked Links',
      icon: Share2,
      items: submenuItems,
    },
  ];
}

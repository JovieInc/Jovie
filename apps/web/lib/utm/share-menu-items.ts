/**
 * UTM Share Menu Items
 *
 * Utility functions to generate UTM share menu items for release
 * context menus, action menus, and sidebar menus.
 */

import type { CommonDropdownItem } from '@jovie/ui';
import { Link2, Mail, Music2, Share2 } from 'lucide-react';
import React from 'react';
import { toast } from 'sonner';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu/types';
import type {
  ContextMenuAction,
  ContextMenuItemType,
} from '@/components/organisms/table';
import { copyToClipboard } from '@/hooks/useClipboard';
import { captureError } from '@/lib/error-tracking';
import { buildUTMUrl } from './build-url';
import { getDefaultQuickPresets } from './presets';
import type { UTMContext, UTMPreset } from './types';

const UTM_PRESET_LUCIDE_ICONS = {
  Music2,
  Mail,
} as const;

const UTM_PRESET_PLATFORM_ICONS: Record<string, string> = {
  spotify: 'spotify',
  apple_music: 'apple_music',
  instagram: 'instagram',
  twitter: 'twitter',
  facebook: 'facebook',
  youtube: 'youtube',
  tiktok: 'tiktok',
  linkedin: 'linkedin',
  discord: 'discord',
  reddit: 'reddit',
  snapchat: 'snapchat',
  threads: 'threads',
  telegram: 'telegram',
  line: 'line',
  rumble: 'rumble',
  soundcloud: 'soundcloud',
  patreon: 'patreon',
  onlyfans: 'onlyfans',
  quora: 'quora',
  viber: 'viber',
};

function resolvePresetIcon(preset: UTMPreset) {
  const source = preset.params.utm_source?.trim().toLowerCase() ?? '';
  const iconKey =
    typeof preset.icon === 'string' ? preset.icon.trim().toLowerCase() : '';
  const platformKey =
    UTM_PRESET_PLATFORM_ICONS[source] ?? UTM_PRESET_PLATFORM_ICONS[iconKey];

  if (platformKey) {
    return React.createElement(SocialIcon, {
      platform: platformKey,
      className: 'h-4 w-4',
    });
  }

  const LucideIcon =
    UTM_PRESET_LUCIDE_ICONS[
      preset.icon as keyof typeof UTM_PRESET_LUCIDE_ICONS
    ] ?? Link2;

  return React.createElement(LucideIcon, { className: 'h-4 w-4' });
}

/**
 * Copy a UTM-tagged URL to the clipboard with toast feedback.
 */
async function copyUTMUrl(params: {
  url: string;
  preset: UTMPreset;
  context: UTMContext;
}): Promise<boolean> {
  const result = buildUTMUrl({
    url: params.url,
    params: params.preset.params,
    context: params.context,
  });
  const copied = await copyToClipboard(result.url);

  if (copied) {
    toast.success(`Copied with ${params.preset.label} UTM`, {
      description: 'Link includes tracking parameters',
    });
    return true;
  }

  captureError(
    'Failed to copy UTM link',
    new Error('UTM clipboard copy failed'),
    {
      presetId: params.preset.id,
      utmSource: params.preset.params.utm_source ?? '',
    }
  );
  toast.error('Could not copy UTM link', {
    description: 'Please try again or copy manually.',
  });
  return false;
}

/**
 * Build UTM context from release data.
 */
export function buildUTMContext(params: {
  smartLinkUrl: string;
  releaseSlug: string;
  releaseTitle: string;
  artistName?: string | null;
  releaseDate?: string;
}): UTMContext {
  return {
    baseUrl: params.smartLinkUrl,
    releaseSlug: params.releaseSlug,
    releaseTitle: params.releaseTitle,
    artistName: params.artistName ?? undefined,
    releaseDate: params.releaseDate,
  };
}

/**
 * Generate UTM share items for ContextMenuItemType[] (used in table context menus).
 *
 * Returns a separator followed by quick preset actions.
 */
export function getUTMShareContextMenuItems(params: {
  smartLinkUrl: string;
  context: UTMContext;
  onCopied?: (presetId: string) => void;
}): ContextMenuItemType[] {
  const { smartLinkUrl, context, onCopied } = params;
  const quickPresets = getDefaultQuickPresets();

  if (quickPresets.length === 0) return [];

  const items: ContextMenuItemType[] = [{ type: 'separator' }];

  for (const preset of quickPresets) {
    const action: ContextMenuAction = {
      id: `utm-share-${preset.id}`,
      label: `Copy for ${preset.label}`,
      icon: resolvePresetIcon(preset),
      onClick: async () => {
        const copied = await copyUTMUrl({ url: smartLinkUrl, preset, context });
        if (copied) {
          onCopied?.(preset.id);
        }
      },
    };
    items.push(action);
  }

  return items;
}

/**
 * Generate UTM share items as TableActionMenuItem[] (used in legacy table row menus).
 *
 * Returns a separator followed by a submenu containing quick preset actions.
 */
export function getUTMShareActionMenuItems(params: {
  smartLinkUrl: string;
  context: UTMContext;
  onCopied?: (presetId: string) => void;
}): TableActionMenuItem[] {
  const { smartLinkUrl, context, onCopied } = params;
  const quickPresets = getDefaultQuickPresets();

  if (quickPresets.length === 0) return [];

  const children: TableActionMenuItem[] = quickPresets.map(preset => ({
    id: `utm-share-${preset.id}`,
    label: preset.label,
    icon: resolvePresetIcon(preset),
    onClick: async () => {
      const copied = await copyUTMUrl({ url: smartLinkUrl, preset, context });
      if (copied) {
        onCopied?.(preset.id);
      }
    },
  }));

  return [
    {
      id: 'separator',
      label: '',
    },
    {
      id: 'utm-share-submenu',
      label: 'Copy with UTM',
      icon: Share2,
      children,
    },
  ];
}

/**
 * Generate UTM share items as CommonDropdownItem[] (used in sidebar/drawer menus).
 *
 * Returns a separator followed by a single submenu item containing UTM presets.
 */
export function getUTMShareDropdownItems(params: {
  smartLinkUrl: string;
  context: UTMContext;
  onCopied?: (presetId: string) => void;
}): CommonDropdownItem[] {
  const { smartLinkUrl, context, onCopied } = params;
  const quickPresets = getDefaultQuickPresets();

  if (quickPresets.length === 0) return [];

  const submenuItems: CommonDropdownItem[] = quickPresets.map(preset => ({
    type: 'action' as const,
    id: `utm-share-${preset.id}`,
    label: preset.label,
    icon: resolvePresetIcon(preset),
    onClick: async () => {
      const copied = await copyUTMUrl({ url: smartLinkUrl, preset, context });
      if (copied) {
        onCopied?.(preset.id);
      }
    },
  }));

  return [
    { type: 'separator', id: 'sep-utm' },
    {
      type: 'submenu',
      id: 'utm-share-submenu',
      label: 'Copy with UTM',
      icon: Share2,
      items: submenuItems,
    },
  ];
}

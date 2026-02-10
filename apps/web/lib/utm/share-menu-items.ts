/**
 * UTM Share Menu Items
 *
 * Utility functions to generate UTM share menu items for release
 * context menus, action menus, and sidebar menus.
 */

import type { CommonDropdownItem } from '@jovie/ui';
import { Share2 } from 'lucide-react';
import { toast } from 'sonner';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu/types';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type { ContextMenuAction } from '@/components/organisms/table/molecules/TableContextMenu';
import { buildUTMUrl } from './build-url';
import { getDefaultQuickPresets } from './presets';
import type { UTMContext, UTMPreset } from './types';

/**
 * Copy a UTM-tagged URL to the clipboard with toast feedback.
 */
async function copyUTMUrl(params: {
  url: string;
  preset: UTMPreset;
  context: UTMContext;
}) {
  const result = buildUTMUrl({
    url: params.url,
    params: params.preset.params,
    context: params.context,
  });
  try {
    await navigator.clipboard.writeText(result.url);
    toast.success(`Copied with ${params.preset.label} UTM`, {
      description: 'Link includes tracking parameters',
    });
  } catch (error) {
    console.error('Failed to copy UTM link', error);
    toast.error('Could not copy UTM link', {
      description: 'Please try again or copy manually.',
    });
  }
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
      onClick: () => {
        void copyUTMUrl({ url: smartLinkUrl, preset, context }).then(() => {
          onCopied?.(preset.id);
        });
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
    onClick: () => {
      void copyUTMUrl({ url: smartLinkUrl, preset, context }).then(() => {
        onCopied?.(preset.id);
      });
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
    onClick: () => {
      void copyUTMUrl({ url: smartLinkUrl, preset, context }).then(() => {
        onCopied?.(preset.id);
      });
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

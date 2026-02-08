/**
 * UTM Share Menu Items
 *
 * Utility functions to generate UTM share menu items for release
 * context menus, action menus, and sidebar menus.
 */

import type { CommonDropdownItem } from '@jovie/ui';
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
  await navigator.clipboard.writeText(result.url);
  toast.success(`Copied with ${params.preset.label} UTM`, {
    description: 'Link includes tracking parameters',
  });
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
 * Returns a separator followed by quick preset actions.
 */
export function getUTMShareActionMenuItems(params: {
  smartLinkUrl: string;
  context: UTMContext;
  onCopied?: (presetId: string) => void;
}): TableActionMenuItem[] {
  const { smartLinkUrl, context, onCopied } = params;
  const quickPresets = getDefaultQuickPresets();

  if (quickPresets.length === 0) return [];

  const items: TableActionMenuItem[] = [
    {
      id: 'separator',
      label: '',
      onClick: () => {},
    },
  ];

  for (const preset of quickPresets) {
    items.push({
      id: `utm-share-${preset.id}`,
      label: `Copy for ${preset.label}`,
      onClick: () => {
        void copyUTMUrl({ url: smartLinkUrl, preset, context }).then(() => {
          onCopied?.(preset.id);
        });
      },
    });
  }

  return items;
}

/**
 * Generate UTM share items as CommonDropdownItem[] (used in sidebar/drawer menus).
 */
export function getUTMShareDropdownItems(params: {
  smartLinkUrl: string;
  context: UTMContext;
  onCopied?: (presetId: string) => void;
}): CommonDropdownItem[] {
  const { smartLinkUrl, context, onCopied } = params;
  const quickPresets = getDefaultQuickPresets();

  if (quickPresets.length === 0) return [];

  const items: CommonDropdownItem[] = [
    { type: 'separator', id: 'sep-utm' },
    { type: 'label', id: 'label-utm', label: 'Share with UTM' },
  ];

  for (const preset of quickPresets) {
    items.push({
      type: 'action',
      id: `utm-share-${preset.id}`,
      label: `Copy for ${preset.label}`,
      onClick: () => {
        void copyUTMUrl({ url: smartLinkUrl, preset, context }).then(() => {
          onCopied?.(preset.id);
        });
      },
    });
  }

  return items;
}

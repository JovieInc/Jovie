import type { ReactNode } from 'react';

import { Icon } from '@/components/atoms/Icon';
import type { ContextMenuItemType } from '@/components/organisms/table';
import { buildCopyMenuItems } from '@/features/ui/CopyableField';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import {
  getTrackedShareIcon,
  groupTrackedPresetsBySource,
} from '@/lib/share/tracked-sources';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { ALL_UTM_PRESETS, buildUTMContext, buildUTMUrl } from '@/lib/utm';

const menuIcon = (
  name:
    | 'PencilLine'
    | 'Link2'
    | 'Hash'
    | 'ExternalLink'
    | 'Lock'
    | 'Clock'
    | 'Music'
    | 'Sparkles'
    | 'Trash2'
    | 'Copy'
) => <Icon name={name} className='h-3.5 w-3.5' />;

export interface BuildReleaseActionsOptions {
  readonly release: ReleaseViewModel;
  readonly onEdit: (release: ReleaseViewModel) => void;
  readonly onCopy: (
    path: string,
    label: string,
    testId: string
  ) => Promise<string | void>;
  readonly artistName?: string | null;
  /** Smart link lock check (Pro feature gating) */
  readonly isSmartLinkLocked?: (releaseId: string) => boolean;
  readonly getSmartLinkLockReason?: (
    releaseId: string
  ) => 'scheduled' | 'cap' | null;
  /** Delete handler — when provided, a delete action is included */
  readonly onDelete?: (releaseId: string) => void;
  /** QR code handler — when provided, a QR code copy action is included */
  readonly onCopyQrCode?: () => void;
  /** Custom icon for QR code action (lucide-react QrCode is not in the Icon atom) */
  readonly qrCodeIcon?: ReactNode;
  readonly canGenerateAlbumArt?: boolean;
  readonly onGenerateAlbumArt?: (release: ReleaseViewModel) => void;
  readonly canGenerateCanvas?: boolean;
  readonly onGenerateAllCanvases?: (release: ReleaseViewModel) => void;
}

function buildShareItems(
  opts: Pick<
    BuildReleaseActionsOptions,
    'release' | 'onCopy' | 'artistName' | 'onCopyQrCode' | 'qrCodeIcon'
  > & {
    locked: boolean;
    lockReason: 'scheduled' | 'cap' | null;
    smartLinkUrl: string;
  }
): ContextMenuItemType[] {
  const {
    release,
    onCopy,
    artistName,
    onCopyQrCode,
    qrCodeIcon,
    locked,
    lockReason,
    smartLinkUrl,
  } = opts;

  if (locked) {
    return [
      {
        id: 'copy-smart-link',
        label:
          lockReason === 'scheduled'
            ? 'Scheduled smart link (Pro)'
            : 'Smart link (Pro)',
        icon: menuIcon(lockReason === 'scheduled' ? 'Clock' : 'Lock'),
        disabled: true,
        onClick: () => {},
      },
    ];
  }

  const items: ContextMenuItemType[] = [
    {
      id: 'copy-smart-link',
      label: 'Copy smart link',
      icon: menuIcon('Copy'),
      onClick: () => {
        void onCopy(
          release.smartLinkPath,
          `${release.title} smart link`,
          `smart-link-copy-${release.id}`
        );
      },
    },
  ];

  const trackedContext = buildUTMContext({
    smartLinkUrl,
    releaseSlug: release.slug,
    releaseTitle: release.title,
    artistName,
    releaseDate: release.releaseDate,
  });
  const utmShareItems: ContextMenuItemType[] = [
    {
      id: 'tracked-share-submenu',
      label: 'Tracked Links',
      icon: menuIcon('Link2'),
      items: groupTrackedPresetsBySource(ALL_UTM_PRESETS).map(sourceGroup => {
        if (sourceGroup.presets.length === 1) {
          const preset = sourceGroup.presets[0];
          return {
            id: `tracked-${preset.id}`,
            label: sourceGroup.label,
            icon: getTrackedShareIcon(sourceGroup.source),
            onClick: () => {
              const result = buildUTMUrl({
                url: smartLinkUrl,
                params: preset.params,
                context: trackedContext,
              });
              void onCopy(
                result.url.replace(getBaseUrl(), ''),
                preset.label,
                `tracked-share-${preset.id}-${release.id}`
              );
            },
          } satisfies ContextMenuItemType;
        }

        return {
          id: `tracked-group-${sourceGroup.source}`,
          label: sourceGroup.label,
          icon: getTrackedShareIcon(sourceGroup.source),
          items: sourceGroup.presets.map(
            preset =>
              ({
                id: `tracked-${preset.id}`,
                label: preset.label,
                onClick: () => {
                  const result = buildUTMUrl({
                    url: smartLinkUrl,
                    params: preset.params,
                    context: trackedContext,
                  });
                  void onCopy(
                    result.url.replace(getBaseUrl(), ''),
                    preset.label,
                    `tracked-share-${preset.id}-${release.id}`
                  );
                },
              }) satisfies ContextMenuItemType
          ),
        } satisfies ContextMenuItemType;
      }),
    },
  ];

  if (utmShareItems.length > 0) {
    items.push({ type: 'separator' }, ...utmShareItems);
  }

  if (release.hasVideoLinks) {
    items.push(
      { type: 'separator' },
      {
        id: 'copy-sounds-link',
        label: 'Copy Use Sound link',
        icon: menuIcon('Music'),
        onClick: () => {
          void onCopy(
            `${release.smartLinkPath}/sounds`,
            `${release.title} sounds link`,
            `sounds-link-copy-${release.id}`
          );
        },
      }
    );
  }

  if (onCopyQrCode) {
    items.push(
      { type: 'separator' },
      {
        id: 'copy-qr-code',
        label: 'Copy QR code',
        icon: qrCodeIcon,
        onClick: onCopyQrCode,
      }
    );
  }

  return items;
}

/**
 * Canonical builder for release action menus.
 *
 * Returns `ContextMenuItemType[]` that works with:
 * - Right-click context menus (via `TableContextMenu`)
 * - Ellipsis action button dropdowns (via `convertContextMenuItems`)
 * - Sidebar overflow menus (via `convertToCommonDropdownItems`)
 */
export function buildReleaseActions({
  release,
  onEdit,
  onCopy,
  artistName,
  isSmartLinkLocked,
  getSmartLinkLockReason,
  onDelete,
  onCopyQrCode,
  qrCodeIcon,
  canGenerateAlbumArt,
  onGenerateAlbumArt,
  canGenerateCanvas,
  onGenerateAllCanvases,
}: BuildReleaseActionsOptions): ContextMenuItemType[] {
  const locked = isSmartLinkLocked?.(release.id) ?? false;
  const lockReason = getSmartLinkLockReason?.(release.id) ?? null;
  const smartLinkUrl = `${getBaseUrl()}${release.smartLinkPath}`;
  const shareItems = buildShareItems({
    release,
    onCopy,
    artistName,
    onCopyQrCode,
    qrCodeIcon,
    locked,
    lockReason,
    smartLinkUrl,
  });

  const metadataItems = buildCopyMenuItems([
    { id: 'release-id', label: 'Release ID', value: release.id },
    release.lyrics?.trim()
      ? { id: 'lyrics', label: 'Lyrics', value: release.lyrics.trim() }
      : null,
    release.upc ? { id: 'upc', label: 'UPC', value: release.upc } : null,
    release.primaryIsrc
      ? { id: 'isrc', label: 'ISRC', value: release.primaryIsrc }
      : null,
  ]);

  const items: ContextMenuItemType[] = [
    {
      id: 'edit',
      label: 'Edit release links',
      icon: menuIcon('PencilLine'),
      onClick: () => onEdit(release),
    },
    ...(canGenerateAlbumArt && onGenerateAlbumArt
      ? [
          {
            id: 'generate-album-art',
            label: 'Generate Album Art',
            icon: menuIcon('Sparkles'),
            onClick: () => onGenerateAlbumArt(release),
          } satisfies ContextMenuItemType,
        ]
      : []),
    ...(canGenerateCanvas && onGenerateAllCanvases
      ? [
          {
            id: 'generate-all-canvases',
            label: 'Generate All Canvases',
            icon: menuIcon('Sparkles'),
            onClick: () => onGenerateAllCanvases(release),
          } satisfies ContextMenuItemType,
        ]
      : []),
    {
      type: 'separator',
    },
    {
      id: 'share-link',
      label: 'Share link',
      icon: menuIcon('Link2'),
      items: shareItems,
    },
    {
      type: 'separator',
    },
    {
      id: 'copy-metadata',
      label: 'Copy metadata',
      icon: menuIcon('Hash'),
      items: metadataItems,
    },
  ];

  // ── External provider links ──
  const supportedProviders = new Set<ProviderKey>([
    'spotify',
    'apple_music',
    'youtube',
    'deezer',
  ]);
  const providerLabels: Partial<Record<ProviderKey, string>> = {
    spotify: 'Spotify',
    apple_music: 'Apple Music',
    youtube: 'YouTube Music',
    deezer: 'Deezer',
  };

  const externalProviders = release.providers.filter(
    p => supportedProviders.has(p.key) && p.url
  );

  if (externalProviders.length > 0) {
    items.push(
      { type: 'separator' },
      {
        id: 'open-release',
        label: 'Open in',
        icon: menuIcon('ExternalLink'),
        items: externalProviders.map(provider => ({
          id: `open-${provider.key}`,
          label: `Open in ${providerLabels[provider.key] || provider.key}`,
          icon: menuIcon('ExternalLink'),
          onClick: () => {
            globalThis.open(provider.url, '_blank', 'noopener,noreferrer');
          },
        })),
      }
    );
  }

  // ── Destructive group ──
  if (onDelete) {
    items.push(
      { type: 'separator' },
      {
        id: 'delete',
        label: 'Delete release',
        icon: menuIcon('Trash2'),
        destructive: true,
        onClick: () => onDelete(release.id),
      }
    );
  }

  return items;
}

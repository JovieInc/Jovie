import type { ReactNode } from 'react';

import { Icon } from '@/components/atoms/Icon';
import type { ContextMenuItemType } from '@/components/organisms/table';
import { buildCopyMenuItems } from '@/components/ui/CopyableField';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { buildUTMContext, getUTMShareContextMenuItems } from '@/lib/utm';

const menuIcon = (
  name: 'PencilLine' | 'Link2' | 'Hash' | 'ExternalLink' | 'Lock' | 'Clock' | 'Trash2' | 'Copy'
) => <Icon name={name} className='h-3.5 w-3.5' />;

export interface BuildReleaseActionsOptions {
  readonly release: ReleaseViewModel;
  readonly onEdit: (release: ReleaseViewModel) => void;
  readonly onCopy: (path: string, label: string, testId: string) => Promise<string | void>;
  readonly artistName?: string | null;
  /** Smart link lock check (Pro feature gating) */
  readonly isSmartLinkLocked?: (releaseId: string) => boolean;
  readonly getSmartLinkLockReason?: (releaseId: string) => 'scheduled' | 'cap' | null;
  /** Delete handler — when provided, a delete action is included */
  readonly onDelete?: (releaseId: string) => void;
  /** QR code handler — when provided, a QR code copy action is included */
  readonly onCopyQrCode?: () => void;
  /** Custom icon for QR code action (lucide-react QrCode is not in the Icon atom) */
  readonly qrCodeIcon?: ReactNode;
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
}: BuildReleaseActionsOptions): ContextMenuItemType[] {
  const locked = isSmartLinkLocked?.(release.id) ?? false;
  const lockReason = getSmartLinkLockReason?.(release.id) ?? null;
  const smartLinkUrl = `${getBaseUrl()}${release.smartLinkPath}`;

  // ── Edit group ──
  const items: ContextMenuItemType[] = [
    {
      id: 'edit',
      label: 'Edit links',
      icon: menuIcon('PencilLine'),
      onClick: () => onEdit(release),
    },
  ];

  // ── Copy / share group ──
  if (locked) {
    items.push({
      id: 'copy-smart-link',
      label:
        lockReason === 'scheduled'
          ? 'Scheduled (Pro)'
          : 'Smart link (Pro)',
      icon: menuIcon(lockReason === 'scheduled' ? 'Clock' : 'Lock'),
      disabled: true,
      onClick: () => {},
    } as ContextMenuItemType);
  } else {
    items.push(
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
      } as ContextMenuItemType,
      // UTM share presets
      ...getUTMShareContextMenuItems({
        smartLinkUrl,
        context: buildUTMContext({
          smartLinkUrl,
          releaseSlug: release.slug,
          releaseTitle: release.title,
          artistName,
          releaseDate: release.releaseDate,
        }),
      })
    );
  }

  // ── QR code (when handler provided) ──
  if (onCopyQrCode) {
    items.push({
      id: 'copy-qr-code',
      label: 'Copy QR code',
      icon: qrCodeIcon,
      onClick: onCopyQrCode,
    });
  }

  // ── Metadata copy group ──
  items.push({ type: 'separator' });
  items.push(
    ...buildCopyMenuItems([
      { id: 'release-id', label: 'Release ID', value: release.id },
      release.lyrics?.trim()
        ? { id: 'lyrics', label: 'Lyrics', value: release.lyrics.trim() }
        : null,
      release.upc ? { id: 'upc', label: 'UPC', value: release.upc } : null,
      release.primaryIsrc
        ? { id: 'isrc', label: 'ISRC', value: release.primaryIsrc }
        : null,
    ])
  );

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
    items.push({ type: 'separator' });
    for (const provider of externalProviders) {
      items.push({
        id: `open-${provider.key}`,
        label: `Open in ${providerLabels[provider.key] || provider.key}`,
        icon: menuIcon('ExternalLink'),
        onClick: () => {
          globalThis.open(provider.url, '_blank', 'noopener,noreferrer');
        },
      });
    }
  }

  // ── Destructive group ──
  if (onDelete) {
    items.push({ type: 'separator' });
    items.push({
      id: 'delete',
      label: 'Delete release',
      icon: menuIcon('Trash2'),
      destructive: true,
      onClick: () => onDelete(release.id),
    });
  }

  return items;
}

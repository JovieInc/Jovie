import { Icon } from '@/components/atoms/Icon';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { buildUTMContext, getUTMShareContextMenuItems } from '@/lib/utm';

interface GetReleaseContextMenuItemsOptions {
  release: ReleaseViewModel;
  onEdit: (release: ReleaseViewModel) => void;
  onCopy: (path: string, label: string, testId: string) => Promise<string>;
  artistName?: string | null;
  isSmartLinkLocked?: (releaseId: string) => boolean;
  getSmartLinkLockReason?: (releaseId: string) => 'scheduled' | 'cap' | null;
}

const menuIcon = (
  name: 'PencilLine' | 'Link2' | 'Hash' | 'ExternalLink' | 'Lock' | 'Clock'
) => <Icon name={name} className='h-3.5 w-3.5' />;

/**
 * Build context menu items for a release row.
 * Shared between desktop context menu and mobile swipe actions.
 */
export function getReleaseContextMenuItems({
  release,
  onEdit,
  onCopy,
  artistName,
  isSmartLinkLocked,
  getSmartLinkLockReason,
}: GetReleaseContextMenuItemsOptions): ContextMenuItemType[] {
  const locked = isSmartLinkLocked?.(release.id) ?? false;
  const lockReason = getSmartLinkLockReason?.(release.id) ?? null;

  const items: ContextMenuItemType[] = [
    {
      id: 'edit',
      label: 'Edit links',
      icon: menuIcon('PencilLine'),
      onClick: () => onEdit(release),
    },
    ...(locked
      ? [
          {
            id: 'copy-smart-link',
            label:
              lockReason === 'scheduled'
                ? 'Scheduled (Pro)'
                : 'Smart link (Pro)',
            icon: menuIcon(lockReason === 'scheduled' ? 'Clock' : 'Lock'),
            disabled: true,
            onClick: () => {},
          } as ContextMenuItemType,
        ]
      : [
          {
            id: 'copy-smart-link',
            label: 'Copy smart link',
            icon: menuIcon('Link2'),
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
            smartLinkUrl: `${getBaseUrl()}${release.smartLinkPath}`,
            context: buildUTMContext({
              smartLinkUrl: `${getBaseUrl()}${release.smartLinkPath}`,
              releaseSlug: release.slug,
              releaseTitle: release.title,
              artistName,
              releaseDate: release.releaseDate,
            }),
          }),
        ]),
    { type: 'separator' },
    {
      id: 'copy-release-id',
      label: 'Copy release ID',
      icon: menuIcon('Hash'),
      onClick: () => {
        navigator.clipboard.writeText(release.id);
      },
    },
    {
      id: 'copy-lyrics',
      label: 'Copy lyrics',
      icon: menuIcon('Hash'),
      disabled: !release.lyrics?.trim(),
      onClick: () => {
        if (release.lyrics?.trim()) {
          navigator.clipboard.writeText(release.lyrics);
        }
      },
    },
  ];

  if (release.upc) {
    items.push({
      id: 'copy-upc',
      label: 'Copy UPC',
      icon: menuIcon('Hash'),
      onClick: () => {
        navigator.clipboard.writeText(release.upc!);
      },
    });
  }

  if (release.primaryIsrc) {
    items.push({
      id: 'copy-isrc',
      label: 'Copy ISRC',
      icon: menuIcon('Hash'),
      onClick: () => {
        navigator.clipboard.writeText(release.primaryIsrc!);
      },
    });
  }

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

  return items;
}

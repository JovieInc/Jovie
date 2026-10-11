import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { buildReleaseActions } from './release-actions';

/**
 * buildReleaseActions is a pure builder with no rendered output of its own;
 * it's shared by the ellipsis menu and the row right-click context menu.
 * This story documents its output shape.
 */
function MenuItemsPreview({
  items,
}: {
  readonly items: ContextMenuItemType[];
}) {
  return (
    <ul className='w-64 rounded-lg border border-subtle bg-surface-1 p-1 text-app'>
      {items.map((item, index) =>
        'type' in item ? (
          <li key={`separator-${index}`} className='my-1 h-px bg-subtle' />
        ) : (
          <li
            key={item.id}
            className={
              'destructive' in item && item.destructive
                ? 'text-destructive'
                : 'text-secondary-token'
            }
          >
            {item.label}
            {'items' in item && item.items ? ' →' : ''}
          </li>
        )
      )}
    </ul>
  );
}

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Skyline Dreams',
  slug: 'skyline-dreams',
  status: 'released',
  releaseType: 'single',
  isExplicit: false,
  releaseDate: '2026-01-01',
  artworkUrl: undefined,
  totalTracks: 1,
  providers: [
    {
      key: 'spotify',
      url: 'https://open.spotify.com/album/1',
      source: 'ingested',
      updatedAt: '2026-01-01T00:00:00.000Z',
      label: 'Spotify',
      path: '/album/1',
      isPrimary: true,
    },
  ],
  spotifyPopularity: null,
  smartLinkPath: '/smart/release-1',
  previewUrl: null,
  primaryIsrc: 'US-ABC-26-00001',
  upc: null,
};

const meta = {
  title: 'Dashboard/Organisms/Releases/release-actions',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof MenuItemsPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullMenu: Story = {
  render: () => (
    <MenuItemsPreview
      items={buildReleaseActions({
        release,
        onEdit: () => {},
        onCopy: async () => {},
        onDelete: () => {},
        onChangeStatus: () => {},
      })}
    />
  ),
};

export const SmartLinkLocked: Story = {
  render: () => (
    <MenuItemsPreview
      items={buildReleaseActions({
        release,
        onEdit: () => {},
        onCopy: async () => {},
        isSmartLinkLocked: () => true,
        getSmartLinkLockReason: () => 'cap',
      })}
    />
  ),
};

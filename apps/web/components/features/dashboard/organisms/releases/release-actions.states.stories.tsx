import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type { ReleaseViewModel } from '@/lib/discography/types';
import {
  type BuildReleaseActionsOptions,
  buildReleaseActions,
} from './release-actions';

/**
 * buildReleaseActions is a pure builder with no rendered output of its own.
 * These stories print the menu it returns, with submenus nested, for each
 * state of its inputs.
 */
function ActionList({ items }: { readonly items: ContextMenuItemType[] }) {
  return (
    <ul className='space-y-0.5'>
      {items.map((item, index) =>
        'type' in item ? (
          <li key={`separator-${index}`} className='my-1 h-px bg-subtle' />
        ) : (
          <li
            key={item.id}
            className={
              'disabled' in item && item.disabled
                ? 'text-tertiary-token'
                : 'text-secondary-token'
            }
          >
            <span className='block truncate px-2 py-1'>{item.label}</span>
            {'items' in item && item.items ? (
              <div className='ps-4'>
                <ActionList items={item.items} />
              </div>
            ) : null}
          </li>
        )
      )}
    </ul>
  );
}

function ReleaseActions(options: BuildReleaseActionsOptions) {
  return (
    <section
      aria-label='Release actions'
      className='w-64 rounded-lg border border-subtle bg-surface-1 p-1 text-app'
    >
      <ActionList items={buildReleaseActions(options)} />
    </section>
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

const everyProvider: ReleaseViewModel['providers'] = [
  release.providers[0],
  {
    key: 'apple_music',
    url: 'https://music.apple.com/album/1',
    source: 'ingested',
    updatedAt: '2026-01-01T00:00:00.000Z',
    label: 'Apple Music',
    path: '/album/1',
    isPrimary: false,
  },
  {
    key: 'deezer',
    url: 'https://www.deezer.com/album/1',
    source: 'manual',
    updatedAt: '2026-01-01T00:00:00.000Z',
    label: 'Deezer',
    path: '/album/1',
    isPrimary: false,
  },
];

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

const meta = {
  title: 'Dashboard/Organisms/Releases/release-actions States',
  component: ReleaseActions,
  args: {
    release,
    onEdit: () => {},
    onCopy: async () => {},
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ReleaseActions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no provider links and no identifiers leaves no Open In action. */
export const EmptyNoProviders: Story = {
  args: { release: { ...release, providers: [], primaryIsrc: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText(/^Open in/i)).toBeNull();
    await expect(canvas.queryByText('ISRC')).toBeNull();
    await expect(canvas.getByText('Copy Smart Link')).toBeVisible();
  },
};

/** Partial: only the required options, so no status, pitch, QR or delete. */
export const PartialRequiredOptionsOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Open in Spotify')).toBeVisible();
    await expect(canvas.queryByText('Delete Release')).toBeNull();
    await expect(canvas.queryByText(/^Status:/)).toBeNull();
    await expect(canvas.queryByText('Copy QR Code')).toBeNull();
  },
};

/** Long content: every capability on, several providers, lyrics and a UPC. */
export const LongContentEveryAction: Story = {
  args: {
    release: {
      ...release,
      title:
        'Skyline Dreams (Extended Orchestral Reprise with the Northern Coastline Choir)',
      providers: everyProvider,
      hasVideoLinks: true,
      lyrics: 'City lights below me',
      upc: '123456789012',
    },
    artistName: 'Sasha Waves and the Northern Coastline Orchestra',
    canGenerateAlbumArt: true,
    onGenerateAlbumArt: () => {},
    onGeneratePitch: () => {},
    onCopyQrCode: () => {},
    onChangeStatus: () => {},
    onDelete: () => {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Open In')).toBeVisible();
    await expect(canvas.getByText('Open in Apple Music')).toBeVisible();
    await expect(canvas.getByText('Status: Released')).toBeVisible();
    await expect(canvas.getByText('Copy Use Sound Link')).toBeVisible();
    await expect(canvas.getByText('Delete Release')).toBeVisible();
  },
};

/** Permission denied: a plan-capped smart link is disabled and unshareable. */
export const PermissionDeniedSmartLinkCapped: Story = {
  args: {
    isSmartLinkLocked: () => true,
    getSmartLinkLockReason: () => 'cap',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Smart link (Pro)')).toBeVisible();
    await expect(canvas.queryByText('Share Link')).toBeNull();
  },
};

/** Permission denied: a scheduled release's smart link waits for release day. */
export const PermissionDeniedSmartLinkScheduled: Story = {
  args: {
    release: { ...release, status: 'scheduled' },
    isSmartLinkLocked: () => true,
    getSmartLinkLockReason: () => 'scheduled',
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Scheduled smart link (Pro)')
    ).toBeVisible();
  },
};

/** Right-to-left: the full menu inside an RTL document. */
export const RtlFullMenu: Story = {
  args: { onDelete: () => {}, onChangeStatus: () => {} },
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    // The story's own helper renders a named <section>, whose implicit role
    // is region.
    await expect(
      within(canvasElement).getByRole('region', { name: 'Release actions' })
    ).toBeVisible();
  },
};

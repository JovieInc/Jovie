import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  ConnectedReleaseEmptyState,
  ReleaseImportProgressNotice,
} from './ReleaseProviderMatrixNotices';

const LONG_ARTIST_NAME =
  'Sasha Waves and the Extraordinarily Long Collaborative Orchestra of the Northern Coastline';

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

function renderLongImportNotice() {
  return (
    <div className='w-full max-w-sm'>
      <ReleaseImportProgressNotice
        visible
        artistName={LONG_ARTIST_NAME}
        importedCount={1280}
        totalCount={4096}
      />
    </div>
  );
}

const meta = {
  title: 'Dashboard/Releases/ConnectedReleaseEmptyState States',
  component: ConnectedReleaseEmptyState,
  args: {
    visible: true,
    canCreateManualReleases: true,
    isSyncing: false,
    onSync: fn(),
    onCreateManual: fn(),
  },
} satisfies Meta<typeof ConnectedReleaseEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: a sync is running, so the sync button is busy and disabled. */
export const LoadingSyncing: Story = {
  args: { isSyncing: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Syncing...' })
    ).toBeDisabled();
    await expect(
      canvas.getByRole('button', { name: 'Create Release' })
    ).toBeEnabled();
  },
};

/** Empty: Spotify is connected but the catalog has no releases yet. */
export const EmptyConnectedNoReleases: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'No Releases Yet' })
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Sync from Spotify' })
    );
    await expect(args.onSync).toHaveBeenCalledTimes(1);
  },
};

/** Long content: the import notice with a long artist name in a narrow column. */
export const LongContentImportArtistName: Story = {
  render: renderLongImportNotice,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('1280 of 4096 imported')
    ).toBeVisible();
  },
};

/** Right-to-left: the connected empty state inside an RTL document. */
export const RtlConnectedEmpty: Story = {
  args: { canCreateManualReleases: false },
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Sync from Spotify to start generating smart links.')
    ).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: 'Create Release' })
    ).toBeNull();
  },
};

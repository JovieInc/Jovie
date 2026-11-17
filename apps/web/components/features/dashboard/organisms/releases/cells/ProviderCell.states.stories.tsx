import { TooltipProvider } from '@jovie/ui';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { ProviderCell } from './ProviderCell';

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Skyline Dreams',
  slug: 'skyline-dreams',
  releaseType: 'single',
  status: 'released',
  isExplicit: false,
  releaseDate: '2026-01-01',
  artworkUrl: undefined,
  totalTracks: 1,
  providers: [
    {
      key: 'spotify' as ProviderKey,
      url: 'https://open.spotify.com/track/abc',
      path: '/smart/release-1?utm_source=spotify',
      label: 'Spotify',
      isPrimary: true,
      source: 'ingested',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  spotifyPopularity: null,
  smartLinkPath: '/smart/release-1',
  previewUrl: null,
  primaryIsrc: null,
  upc: null,
};

const withTooltips: Decorator = Story => (
  <TooltipProvider>
    <Story />
  </TooltipProvider>
);

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

const withNarrowCell: Decorator = Story => (
  <div className='w-32 overflow-hidden'>
    <Story />
  </div>
);

const meta = {
  title: 'Dashboard/Organisms/Releases/Cells/ProviderCell States',
  component: ProviderCell,
  parameters: { layout: 'centered' },
  decorators: [withTooltips],
  args: {
    release,
    provider: 'spotify' as ProviderKey,
    config: { label: 'Spotify', accent: '#22c55e' },
    onCopy: fn(async () => 'copied'),
  },
} satisfies Meta<typeof ProviderCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no provider link and no way to add one shows a dash. */
export const EmptyMissingReadOnly: Story = {
  args: { release: { ...release, providers: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('img', { name: 'Missing provider link' })
    ).toBeVisible();
    await expect(canvas.getByText('—')).toBeVisible();
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

/** Empty: no provider link, with the Add link trigger. */
export const EmptyMissingWithAdd: Story = {
  args: {
    release: { ...release, providers: [] },
    onAddUrl: fn(async () => undefined),
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Add Spotify link' })
    ).toBeVisible();
  },
};

/** Error: a rejected copy leaves the button on Copy, never Copied. */
export const ErrorCopyRejected: Story = {
  args: {
    onCopy: fn(async () => {
      throw new Error('Clipboard unavailable');
    }),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Copy' }));
    await expect(args.onCopy).toHaveBeenCalledTimes(1);
    await expect(canvas.getByRole('button', { name: 'Copy' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Copied' })).toBeNull();
  },
};

/** Long content: a long provider name in a narrow column keeps one line. */
export const LongContentProviderLabel: Story = {
  args: {
    release: { ...release, providers: [] },
    config: {
      label: 'An Extraordinarily Long Streaming Provider Name For Wrapping',
      accent: '#22c55e',
    },
    onAddUrl: fn(async () => undefined),
  },
  decorators: [withNarrowCell],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', {
        name: 'Add An Extraordinarily Long Streaming Provider Name For Wrapping link',
      })
    ).toBeInTheDocument();
  },
};

/** Right-to-left: a manually added link inside an RTL document. */
export const RtlManualLink: Story = {
  args: {
    release: {
      ...release,
      providers: [{ ...release.providers[0], source: 'manual' }],
    },
  },
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('img', {
        name: 'Manually added provider link',
      })
    ).toBeVisible();
  },
};

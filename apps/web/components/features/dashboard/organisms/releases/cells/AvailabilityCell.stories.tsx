import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { AvailabilityCell } from './AvailabilityCell';

const release: ReleaseViewModel = {
  id: 'release-1',
  profileId: 'profile-1',
  title: 'Midnight Signal',
  status: 'released',
  releaseDate: '2026-01-01',
  artworkUrl: undefined,
  slug: 'midnight-signal',
  smartLinkPath: '/r/midnight-signal',
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  providers: [
    {
      key: 'spotify',
      label: 'Spotify',
      url: 'https://open.spotify.com/track/abc',
      path: '/r/midnight-signal?utm_source=spotify',
      isPrimary: true,
      source: 'manual',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

const meta = {
  title: 'Features/Dashboard/Organisms/Releases/Cells/AvailabilityCell',
  component: AvailabilityCell,
  parameters: {
    layout: 'centered',
    // Callback parameters are not component props. Copied verifies onCopy;
    // onAddUrl retains the existing add-link interaction owner.
    jovie: { uncoveredProps: ['testId', 'releaseId', 'provider'] },
  },
  args: {
    release,
    allProviders: ['spotify', 'apple_music'],
    providerConfig: PROVIDER_CONFIG,
    onCopy: fn().mockResolvedValue('copied'),
    onAddUrl: fn().mockResolvedValue(undefined),
    isAddingUrl: false,
  },
} satisfies Meta<typeof AvailabilityCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Manual: Story = {};
export const Detected: Story = {
  args: {
    release: {
      ...release,
      providers: release.providers.map(provider => ({
        ...provider,
        source: 'ingested' as const,
      })),
    },
  },
};
export const Missing: Story = {
  args: { release: { ...release, providers: [] } },
};
export const Empty: Story = { args: { allProviders: [] } };
export const Copied: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Show Provider Availability Details' })
    );
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Copy Spotify link' })
    );
    await expect(
      await page.findByRole('button', { name: 'Copied Spotify link' })
    ).toHaveClass('text-success');
  },
};

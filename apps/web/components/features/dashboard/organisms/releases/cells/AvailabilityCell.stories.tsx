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
      canvas.getByRole('button', {
        name: /^Show provider availability details:/i,
      })
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

async function openAddLinkForm(canvasElement: HTMLElement, url: string) {
  const canvas = within(canvasElement);
  await userEvent.click(
    canvas.getByRole('button', {
      name: /^Show provider availability details:/i,
    })
  );
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByRole('button', { name: /Add link/ }));
  await userEvent.type(await page.findByPlaceholderText('Paste URL...'), url);
  await userEvent.click(page.getByRole('button', { name: 'Confirm URL' }));
  return page;
}

export const Error: Story = {
  play: async ({ canvasElement }) => {
    const page = await openAddLinkForm(canvasElement, 'https://example.com/x');
    await expect(await page.findByText(/URL must be from/)).toBeVisible();
  },
};

export const Offline: Story = {
  args: { onAddUrl: fn().mockRejectedValue(new TypeError('Failed to fetch')) },
  play: async ({ canvasElement }) => {
    const page = await openAddLinkForm(
      canvasElement,
      'https://music.apple.com/us/album/x/1'
    );
    // The parent owns the error toast; the field keeps the typed URL.
    await expect(await page.findByPlaceholderText('Paste URL...')).toHaveValue(
      'https://music.apple.com/us/album/x/1'
    );
  },
};

export const LongContent: Story = {
  args: {
    release: {
      ...release,
      title:
        'An Extraordinarily Long Release Title That Keeps Going Past One Line',
    },
  },
};

function RtlFrame({ children }: { readonly children: React.ReactNode }) {
  return <div dir='rtl'>{children}</div>;
}

export const Rtl: Story = {
  decorators: [
    function WithRtl(StoryComponent) {
      return (
        <RtlFrame>
          <StoryComponent />
        </RtlFrame>
      );
    },
  ],
};

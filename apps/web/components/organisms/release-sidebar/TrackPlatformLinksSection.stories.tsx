import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { ProviderKey } from '@/lib/discography/types';
import { TrackPlatformLinksSection } from './TrackPlatformLinksSection';

const meta = {
  title: 'Organisms/ReleaseSidebar/TrackPlatformLinksSection',
  decorators: [
    Story => (
      <div className='w-80 max-w-full'>
        <Story />
      </div>
    ),
  ],
  component: TrackPlatformLinksSection,
  parameters: {
    layout: 'centered',
    chromatic: { viewports: [390, 1024] },
    jovie: { uncoveredProps: ['emptyMessage', 'title'] },
  },
  args: {
    findQuery: 'Midnight Drive',
    providers: [
      {
        key: 'spotify' as ProviderKey,
        label: 'Spotify',
        url: 'https://open.spotify.com/track/example',
      },
    ],
    missingProviders: [{ key: 'apple_music' as ProviderKey }],
  },
} satisfies Meta<typeof TrackPlatformLinksSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LinkedAndMissing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Spotify' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Find' })).toBeVisible();
  },
};

export const MissingOnly: Story = {
  args: { providers: [] },
};

export const MissingWithoutSearch: Story = {
  args: { providers: [], findQuery: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Apple Music')).toBeVisible();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { providers: [], missingProviders: [] },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('No DSP links available for this track.')
    ).toBeVisible();
  },
};

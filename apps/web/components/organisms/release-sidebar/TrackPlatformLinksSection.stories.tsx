import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ProviderKey } from '@/lib/discography/types';
import { TrackPlatformLinksSection } from './TrackPlatformLinksSection';

const meta = {
  title: 'Organisms/ReleaseSidebar/TrackPlatformLinksSection',
  component: TrackPlatformLinksSection,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['emptyMessage', 'title'],
    },
  },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TrackPlatformLinksSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LinkedAndMissing: Story = {
  args: {
    providers: [
      {
        key: 'spotify' as ProviderKey,
        label: 'Spotify',
        url: 'https://open.spotify.com/track/example',
      },
    ],
    missingProviders: [{ key: 'apple_music' as ProviderKey }],
    findQuery: 'Midnight Drive',
  },
};

export const AllLinked: Story = {
  args: {
    providers: [
      {
        key: 'spotify' as ProviderKey,
        label: 'Spotify',
        url: 'https://open.spotify.com/track/example',
      },
      {
        key: 'apple_music' as ProviderKey,
        label: 'Apple Music',
        url: 'https://music.apple.com/track/example',
      },
    ],
  },
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ProviderKey } from '@/lib/discography/types';
import { TrackPlatformLinksSection } from './TrackPlatformLinksSection';

const meta = {
  title: 'Organisms/ReleaseSidebar/TrackPlatformLinksSection',
  component: TrackPlatformLinksSection,
  parameters: {
    layout: 'centered',
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

export const LinkedAndMissing: Story = {};

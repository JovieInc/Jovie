import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatLinkConfirmationCard } from './ChatLinkConfirmationCard';

const meta = {
  title: 'Jovie/Components/ChatLinkConfirmationCard',
  component: ChatLinkConfirmationCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
} satisfies Meta<typeof ChatLinkConfirmationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {
  args: {
    profileId: 'profile-story',
    platform: {
      id: 'spotify',
      name: 'Spotify',
      icon: 'spotify',
      color: 'brand-spotify',
    },
    normalizedUrl: 'https://open.spotify.com/artist/story-artist',
    originalUrl: 'https://open.spotify.com/artist/story-artist',
  },
};

export const Dismissed: Story = {
  args: {
    profileId: 'profile-story',
    platform: {
      id: 'spotify',
      name: 'Spotify',
      icon: 'spotify',
      color: 'brand-spotify',
    },
    normalizedUrl: 'https://open.spotify.com/artist/story-artist',
    originalUrl: 'https://open.spotify.com/artist/story-artist',
    toolCallId: 'story-tool-call-dismissed',
  },
};

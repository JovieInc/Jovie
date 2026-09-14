import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatLinkRemovalCard } from './ChatLinkRemovalCard';

const meta = {
  title: 'Jovie/Components/ChatLinkRemovalCard',
  component: ChatLinkRemovalCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
} satisfies Meta<typeof ChatLinkRemovalCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {
  args: {
    profileId: 'profile-story',
    linkId: 'link-story',
    platform: 'Spotify',
    url: 'https://open.spotify.com/artist/story-artist',
  },
};

export const Dismissed: Story = {
  args: {
    profileId: 'profile-story',
    linkId: 'link-story',
    platform: 'Spotify',
    url: 'https://open.spotify.com/artist/story-artist',
  },
};

import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpotifyAccountIdentity } from './SpotifyAccountIdentity';

const meta = {
  title: 'Features/Admin/SpotifyAccountIdentity',
  component: SpotifyAccountIdentity,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof SpotifyAccountIdentity>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DisplayName: Story = {
  args: {
    displayName: 'Ari Lane',
    href: 'https://open.spotify.com/artist/ari',
  },
};

export const HandleOnly: Story = {
  args: {
    handle: '@ari',
    href: 'https://open.spotify.com/artist/ari',
  },
};

export const AccountIdFallback: Story = {
  args: {
    accountId: 'spotify-artist-123',
  },
};

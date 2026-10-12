import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtistProfileLandingRoute } from './ArtistProfileLandingRoute';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileLandingRoute',
  component: ArtistProfileLandingRoute,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The mounted /artist-profiles route: MarketingPageShell plus ArtistProfileLandingPage wired to production copy and feature flags.',
      },
    },
  },
  args: { logoPlacement: { page: '/artist-profiles' } },
} satisfies Meta<typeof ArtistProfileLandingRoute>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Route: Story = {};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildDemoProfile } from '@/components/features/demo/mock-dashboard-data';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { ArtistNotificationsCTA } from './ArtistNotificationsCTA';

// Real demo-profile fixture (used by the actual /demo experience), converted
// to the Artist shape this CTA requires.
const DEMO_ARTIST = convertDrizzleCreatorProfileToArtist(buildDemoProfile());

const meta = {
  title: 'Features/Profile/ArtistNotificationsCTA',
  component: ArtistNotificationsCTA,
  parameters: {
    layout: 'centered',
  },
  args: {
    artist: DEMO_ARTIST,
    source: 'profile_inline',
  },
} satisfies Meta<typeof ArtistNotificationsCTA>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LinkVariant: Story = {
  args: {
    variant: 'link',
  },
};

export const InlineExpanded: Story = {
  args: {
    forceExpanded: true,
  },
};

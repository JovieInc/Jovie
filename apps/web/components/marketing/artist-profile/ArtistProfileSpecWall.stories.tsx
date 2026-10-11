import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ARTIST_NOTIFICATIONS_SPEC_TILES } from '@/data/artistNotificationsFeatures';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_TRUTH_TILES } from '@/data/artistProfileFeatures';
import { ArtistProfileSpecWall } from './ArtistProfileSpecWall';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileSpecWall',
  component: ArtistProfileSpecWall,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ArtistProfileSpecWall>;

export default meta;
type Story = StoryObj<typeof meta>;

// Shipped /artist-notifications five-screenshot-tile bento.
export const ScreenshotBento: Story = {
  args: {
    specWall: ARTIST_NOTIFICATIONS_COPY.specWall,
    tiles: ARTIST_NOTIFICATIONS_SPEC_TILES,
  },
};

// Compact ten-tile product truth wall.
export const TruthWall: Story = {
  args: {
    specWall: ARTIST_PROFILE_COPY.specWall,
    truthTiles: ARTIST_PROFILE_TRUTH_TILES,
  },
};

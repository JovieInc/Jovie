import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ArtistNotificationsHero } from './ArtistNotificationsHero';

const meta = {
  title: 'Marketing/Artist Notifications/ArtistNotificationsHero',
  component: ArtistNotificationsHero,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Floating activity cards are illustrations and carry a visible Example label.',
      },
    },
  },
  args: {
    hero: ARTIST_NOTIFICATIONS_COPY.hero,
  },
} satisfies Meta<typeof ArtistNotificationsHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hero: Story = {
  args: {
    hero: ARTIST_NOTIFICATIONS_COPY.hero,
  },
};

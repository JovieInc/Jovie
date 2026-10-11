import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ArtistNotificationsLanding } from './ArtistNotificationsLanding';

const meta = {
  title: 'Marketing/Artist Notifications/ArtistNotificationsLanding',
  component: ArtistNotificationsLanding,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full /artist-notifications landing page composition: hero, trust strip, capture, reactivation, benefits, spec wall, FAQ, and final CTA.',
      },
    },
  },
  args: {
    copy: ARTIST_NOTIFICATIONS_COPY,
  },
} satisfies Meta<typeof ArtistNotificationsLanding>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Landing: Story = {};

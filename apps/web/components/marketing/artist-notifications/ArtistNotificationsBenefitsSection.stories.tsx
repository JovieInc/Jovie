import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ArtistNotificationsBenefitsSection } from './ArtistNotificationsBenefitsSection';

const meta = {
  title: 'Marketing/Artist Notifications/ArtistNotificationsBenefitsSection',
  component: ArtistNotificationsBenefitsSection,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    benefits: ARTIST_NOTIFICATIONS_COPY.benefits,
  },
} satisfies Meta<typeof ArtistNotificationsBenefitsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Benefits: Story = {};

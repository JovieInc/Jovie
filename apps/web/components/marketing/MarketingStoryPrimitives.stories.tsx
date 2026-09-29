import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import {
  ArtistNotificationFloatingCardView,
  ArtistProfileCaptureVisual,
  ArtistProfileReactivationVisual,
} from './MarketingStoryPrimitives';

const meta = {
  title: 'Marketing/MarketingStoryPrimitives',
  component: ArtistNotificationFloatingCardView,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ArtistNotificationFloatingCardView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FloatingCard: Story = {
  args: {
    card: ARTIST_NOTIFICATIONS_COPY.hero.floatingCards[0],
  },
};

export const CaptureVisual: StoryObj<typeof ArtistProfileCaptureVisual> = {
  render: () => (
    <ArtistProfileCaptureVisual capture={ARTIST_NOTIFICATIONS_COPY.capture} />
  ),
};

export const ReactivationVisual: StoryObj<
  typeof ArtistProfileReactivationVisual
> = {
  render: () => (
    <ArtistProfileReactivationVisual
      notification={ARTIST_PROFILE_COPY.capture.notification}
      reactivation={ARTIST_PROFILE_COPY.reactivation}
    />
  ),
};

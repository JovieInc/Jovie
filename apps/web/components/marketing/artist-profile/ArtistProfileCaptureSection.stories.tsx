import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileCaptureSection } from './ArtistProfileCaptureSection';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileCaptureSection',
  component: ArtistProfileCaptureSection,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    capture: ARTIST_PROFILE_COPY.capture,
  },
} satisfies Meta<typeof ArtistProfileCaptureSection>;

export default meta;
type Story = StoryObj<typeof meta>;

// /artist-profiles: the editorial capture loop (journey copy present).
export const EditorialLoop: Story = {
  args: {
    capture: ARTIST_PROFILE_COPY.capture,
  },
};

// /artist-notifications: the plain visual capture card (no journey copy).
export const VisualCard: Story = {
  args: {
    capture: ARTIST_NOTIFICATIONS_COPY.capture,
  },
};

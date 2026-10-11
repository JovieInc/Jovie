import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileReactivationSection } from './ArtistProfileReactivationSection';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileReactivationSection',
  component: ArtistProfileReactivationSection,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    reactivation: ARTIST_PROFILE_COPY.reactivation,
    notification: ARTIST_PROFILE_COPY.capture.notification,
  },
} satisfies Meta<typeof ArtistProfileReactivationSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reactivation: Story = {};

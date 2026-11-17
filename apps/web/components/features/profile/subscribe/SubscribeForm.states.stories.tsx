import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { buildDemoProfile } from '@/components/features/demo/mock-dashboard-data';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { SubscribeForm } from './SubscribeForm';

const DEMO_ARTIST = convertDrizzleCreatorProfileToArtist(buildDemoProfile());

function withRtl(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Features/Profile/SubscribeForm States',
  component: SubscribeForm,
  parameters: {
    layout: 'centered',
  },
  args: {
    artist: DEMO_ARTIST,
    presentation: 'inline',
  },
} satisfies Meta<typeof SubscribeForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: an artist with no photo, bio or location yet. */
export const PartialArtist: Story = {
  args: {
    artist: {
      ...DEMO_ARTIST,
      image_url: undefined,
      tagline: undefined,
      location: null,
    },
  },
};

/** Long content: a long artist name in the two-step alert flow. */
export const LongContentArtistName: Story = {
  args: {
    artist: {
      ...DEMO_ARTIST,
      name: 'Tim White and the Midnight Orchestra of Los Angeles',
    },
    twoStep: true,
  },
};

/** RTL: the inline alert form in a right-to-left document. */
export const RtlForm: Story = {
  args: {
    artist: { ...DEMO_ARTIST, name: 'تيم وايت' },
  },
  decorators: [withRtl],
};

import type { Meta, StoryObj } from '@storybook/react';
import type { HomepageArtistProfilePreviews } from './HomepageArtistProfiles';
import { ArtistProfileCardRow } from './MeetJovieCarousel';

const previews = [
  {
    id: 'tour',
    label: 'Tour',
    image: {
      publicUrl: '/product-screenshots/tim-white-profile-tour-phone.png',
      width: 780,
      height: 1688,
      alt: 'Jovie artist profile tour preview',
    },
  },
  {
    id: 'subscribe',
    label: 'Subscribe',
    image: {
      publicUrl: '/product-screenshots/tim-white-profile-subscribe-phone.png',
      width: 780,
      height: 1688,
      alt: 'Jovie artist profile subscribe preview',
    },
  },
  {
    id: 'pay',
    label: 'Pay',
    image: {
      publicUrl: '/product-screenshots/tim-white-profile-pay-phone.png',
      width: 780,
      height: 1688,
      alt: 'Jovie artist profile pay preview',
    },
  },
  {
    id: 'presave',
    label: 'Presave',
    image: {
      publicUrl: '/product-screenshots/tim-white-profile-presave-phone.png',
      width: 780,
      height: 1688,
      alt: 'Jovie artist profile presave preview',
    },
  },
] as const satisfies HomepageArtistProfilePreviews;

const meta = {
  title: 'Marketing/MeetJovieCarousel',
  component: ArtistProfileCardRow,
  args: {
    previews,
  },
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ArtistProfileCardRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

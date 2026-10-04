import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_FLAGS } from '@/lib/featureFlags';
import { ArtistProfileLandingPage } from './ArtistProfileLandingPage';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileLandingPage',
  component: ArtistProfileLandingPage,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    copy: ARTIST_PROFILE_COPY,
    flags: ARTIST_PROFILE_FLAGS,
    logoPlacement: { page: '/artist-profiles' },
  },
} satisfies Meta<typeof ArtistProfileLandingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

// Production /artist-profiles composition: every section, gated by the
// live feature flags.
export const FullPage: Story = {};

// FULL_PAGE off: the hero-only fallback body.
export const HeroOnly: Story = {
  args: {
    flags: { ...ARTIST_PROFILE_FLAGS, FULL_PAGE: false },
  },
};

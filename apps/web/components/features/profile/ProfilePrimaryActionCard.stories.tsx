import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfilePrimaryActionCard } from './ProfilePrimaryActionCard';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

const meta: Meta<typeof ProfilePrimaryActionCard> = {
  title: 'Profile/ProfilePrimaryActionCard',
  component: ProfilePrimaryActionCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  args: {
    artist: PROFILE_STORY_ARTIST,
    hasPlayableDestinations: true,
    latestRelease: {
      title: 'Never Say A Word',
      slug: 'never-say-a-word',
      artworkUrl: '/images/avatars/tim-white.jpg',
      releaseDate: '2026-08-01T00:00:00.000Z',
      releaseType: 'single',
    },
  },
};

export default meta;

export const Listen: StoryObj<typeof ProfilePrimaryActionCard> = {};

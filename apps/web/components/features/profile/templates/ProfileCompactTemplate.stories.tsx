import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PROFILE_STORY_ARTIST } from '../profile-story-fixture';
import { ProfileCompactTemplate } from './ProfileCompactTemplate';

const meta: Meta<typeof ProfileCompactTemplate> = {
  title: 'Profile/ProfileCompactTemplate',
  component: ProfileCompactTemplate,
  parameters: {
    layout: 'fullscreen',
    jovie: { uncoveredProps: ['loading'] },
  },
  args: {
    mode: 'profile',
    artist: PROFILE_STORY_ARTIST,
    socialLinks: [],
    contacts: [],
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

export const Profile: StoryObj<typeof ProfileCompactTemplate> = {};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfilePrimaryCTA } from './ProfilePrimaryCTA';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

const meta: Meta<typeof ProfilePrimaryCTA> = {
  title: 'Profile/ProfilePrimaryCTA',
  component: ProfilePrimaryCTA,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  args: {
    artist: PROFILE_STORY_ARTIST,
    socialLinks: [],
    showCapture: false,
  },
};

export default meta;

export const Listen: StoryObj<typeof ProfilePrimaryCTA> = {};

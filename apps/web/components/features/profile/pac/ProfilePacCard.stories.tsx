import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DEFAULT_PROFILE_PAC_ASSIGNMENT } from '@/lib/flags/profile-pac';
import { PROFILE_STORY_ARTIST } from '../profile-story-fixture';
import { ProfilePacCard } from './ProfilePacCard';

const meta = {
  title: 'Profile/ProfilePacCard',
  component: ProfilePacCard,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['disabled'] },
  },
  args: {
    artist: PROFILE_STORY_ARTIST,
    assignment: DEFAULT_PROFILE_PAC_ASSIGNMENT,
    layout: 'profile-landscape',
    renderMode: 'preview',
    captureEnabled: false,
    release: {
      title: 'Never Say A Word',
      slug: 'never-say-a-word',
      artworkUrl: '/art.jpg',
    },
  },
} satisfies Meta<typeof ProfilePacCard>;

export default meta;
export const Default: StoryObj<typeof meta> = {};

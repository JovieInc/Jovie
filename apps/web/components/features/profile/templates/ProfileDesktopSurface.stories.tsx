import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  PROFILE_STORY_ARTIST,
  PROFILE_STORY_CONTENT_PREFS,
  profileStoryNoop,
} from '../profile-story-fixture';
import { ProfileDesktopSurface } from './ProfileDesktopSurface';

const meta: Meta<typeof ProfileDesktopSurface> = {
  title: 'Profile/ProfileDesktopSurface',
  component: ProfileDesktopSurface,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  args: {
    artist: PROFILE_STORY_ARTIST,
    socialLinks: [],
    contacts: [],
    drawerOpen: false,
    drawerView: 'menu',
    onDrawerOpenChange: profileStoryNoop,
    onDrawerViewChange: profileStoryNoop,
    onOpenMenu: profileStoryNoop,
    onPlayClick: profileStoryNoop,
    profileHref: '/timwhite',
    contentPrefs: PROFILE_STORY_CONTENT_PREFS,
    latestRelease: {
      title: 'Never Say A Word',
      slug: 'never-say-a-word',
      artworkUrl: '/images/avatars/tim-white-founder.jpg',
      releaseDate: '2026-08-01T00:00:00.000Z',
      releaseType: 'single',
    },
  },
};

export default meta;

export const Home: StoryObj<typeof ProfileDesktopSurface> = {
  render: args => (
    <div className='min-h-dvh bg-base p-6'>
      <ProfileDesktopSurface {...args} />
    </div>
  ),
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  PROFILE_STORY_ARTIST,
  PROFILE_STORY_CONTENT_PREFS,
  profileStoryNoop,
} from '../profile-story-fixture';
import { ProfileCompactSurface } from './ProfileCompactSurface';

const meta: Meta<typeof ProfileCompactSurface> = {
  title: 'Profile/ProfileCompactSurface',
  component: ProfileCompactSurface,
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
    onBack: profileStoryNoop,
    onOpenMenu: profileStoryNoop,
    onPlayClick: profileStoryNoop,
    onShare: profileStoryNoop,
    profileHref: '/timwhite',
    contentPrefs: PROFILE_STORY_CONTENT_PREFS,
    renderInteractiveOverlays: false,
  },
};

export default meta;

export const Home: StoryObj<typeof ProfileCompactSurface> = {
  render: args => (
    <div className='mx-auto h-dvh w-full max-w-md bg-base'>
      <ProfileCompactSurface {...args} />
    </div>
  ),
};

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
    allowSignedInEscape: false,
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

const STORY_SOCIAL_LINKS = [
  {
    id: 'instagram',
    artist_id: 'story-artist',
    platform: 'instagram',
    url: 'https://instagram.com/timwhite',
    clicks: 0,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tiktok',
    artist_id: 'story-artist',
    platform: 'tiktok',
    url: 'https://www.tiktok.com/@timwhite',
    clicks: 0,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'venmo',
    artist_id: 'story-artist',
    platform: 'venmo',
    url: 'https://venmo.com/u/timwhite',
    clicks: 0,
    created_at: '2026-01-01T00:00:00.000Z',
  },
];

const renderInPhoneColumn: StoryObj<typeof ProfileCompactSurface>['render'] =
  args => (
    <div className='mx-auto h-dvh w-full max-w-md bg-base'>
      <ProfileCompactSurface {...args} />
    </div>
  );

/** Pen y1PaMa: identity header + featured Listen card. */
export const HomeFeaturedListen: StoryObj<typeof ProfileCompactSurface> = {
  render: renderInPhoneColumn,
  args: {
    socialLinks: STORY_SOCIAL_LINKS,
    latestRelease: {
      title: 'Never Say A Word',
      slug: 'never-say-a-word',
      artworkUrl: '/images/avatars/tim-white.jpg',
      releaseDate: '2026-08-01T00:00:00.000Z',
      releaseType: 'single',
    },
  },
};

/** Pen VpRf5: Events card with a truthful empty state. */
export const EventsEmpty: StoryObj<typeof ProfileCompactSurface> = {
  render: renderInPhoneColumn,
  args: { socialLinks: STORY_SOCIAL_LINKS, activeMode: 'tour' },
};

/** Pen MvmY2: Stay close card around the alerts sign-up flow. */
export const StayClose: StoryObj<typeof ProfileCompactSurface> = {
  render: renderInPhoneColumn,
  args: { socialLinks: STORY_SOCIAL_LINKS, activeMode: 'subscribe' },
};

/** Pen p0Jia: Payments card on the About tab. */
export const Payments: StoryObj<typeof ProfileCompactSurface> = {
  render: renderInPhoneColumn,
  args: { socialLinks: STORY_SOCIAL_LINKS, activeMode: 'about' },
};

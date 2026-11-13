import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { PublicRelease } from '@/features/profile/releases/types';
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

/** Proof profile on phones: jov.ie/you claim bar above the dock (JOV-7114). */
export const ProofClaimBar: StoryObj<typeof ProfileCompactSurface> = {
  render: renderInPhoneColumn,
  args: {
    socialLinks: STORY_SOCIAL_LINKS,
    activeMode: 'profile',
    proofClaimCta: { href: '/start', label: 'Claim yours' },
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

const STORY_RELEASE: PublicRelease = {
  id: 'release-1',
  title: 'Never Say A Word',
  slug: 'never-say-a-word',
  releaseType: 'single',
  releaseDate: '2026-08-01',
  artworkUrl: '/images/avatars/tim-white.jpg',
  artistNames: ['Tim White'],
};

/** Stay close while the visitor assignment is unresolved: the alert form
 *  holds its skeleton instead of flashing the wrong variant (JOV-6453). */
export const LoadingVisitorAssignment: StoryObj<typeof ProfileCompactSurface> =
  {
    render: renderInPhoneColumn,
    args: { activeMode: 'subscribe', visitorAssignmentResolved: false },
  };

/** Music tab for an artist with no releases yet. */
export const EmptyMusicCatalog: StoryObj<typeof ProfileCompactSurface> = {
  render: renderInPhoneColumn,
  args: { activeMode: 'listen', releases: [], latestRelease: null },
};

/** A new profile: no photo, tagline, location, links or releases. */
export const PartialNewProfile: StoryObj<typeof ProfileCompactSurface> = {
  render: renderInPhoneColumn,
  args: {
    artist: {
      ...PROFILE_STORY_ARTIST,
      image_url: undefined,
      tagline: undefined,
      location: null,
      settings: {},
    },
    releases: [],
    latestRelease: null,
  },
};

/** A long artist name over a long Music catalog. */
export const LongContentNameAndCatalog: StoryObj<typeof ProfileCompactSurface> =
  {
    render: renderInPhoneColumn,
    args: {
      artist: {
        ...PROFILE_STORY_ARTIST,
        name: 'Tim White and the Los Angeles After Hours Orchestra',
      },
      socialLinks: STORY_SOCIAL_LINKS,
      activeMode: 'listen',
      releases: Array.from({ length: 8 }, (_, index) => ({
        ...STORY_RELEASE,
        id: `release-${index + 1}`,
        slug: `never-say-a-word-part-${index + 1}`,
        title: `Never Say A Word (Extended Club Mix) Part ${index + 1}`,
      })),
    },
  };

/** The phone profile with its claim bar inside a right-to-left page. */
export const Rtl: StoryObj<typeof ProfileCompactSurface> = {
  render: args => (
    <div dir='rtl' lang='ar' className='mx-auto h-dvh w-full max-w-md bg-base'>
      <ProfileCompactSurface {...args} />
    </div>
  ),
  args: {
    artist: {
      ...PROFILE_STORY_ARTIST,
      name: 'تيم وايت',
      tagline: 'منتج وكاتب أغانٍ ورومانسي في ساعات الليل المتأخرة.',
    },
    socialLinks: STORY_SOCIAL_LINKS,
    proofClaimCta: { href: '/start', label: 'احصل على صفحتك' },
  },
};

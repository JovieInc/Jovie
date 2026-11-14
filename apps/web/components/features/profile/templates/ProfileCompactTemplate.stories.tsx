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

type Story = StoryObj<typeof ProfileCompactTemplate>;

/** Swaps fetch for the story; the visitor assignment request never leaves. */
function withAssignmentFetch(response: () => Promise<Response>) {
  return () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = response;
    return () => {
      globalThis.fetch = previousFetch;
    };
  };
}

/** The alert form waits as a skeleton until the visitor assignment settles. */
export const LoadingVisitorAssignment: Story = {
  args: { mode: 'subscribe' },
  beforeEach: withAssignmentFetch(() => new Promise<Response>(() => {})),
};

/** Offline, the assignment request fails and the default alert form shows. */
export const OfflineAlertForm: Story = {
  args: { mode: 'subscribe' },
  beforeEach: withAssignmentFetch(async () => {
    throw new TypeError('Failed to fetch');
  }),
};

/** The catalog failed to load, so the releases destination names the failure. */
export const ErrorCatalogUnavailable: Story = {
  args: { mode: 'releases', releases: [], catalogLoadFailed: true },
};

/** A new profile with no links, release or catalog yet. */
export const EmptyNewProfile: Story = {
  args: { latestRelease: null, releases: [] },
};

/** No photo, tagline or location. */
export const PartialNoPhoto: Story = {
  args: {
    artist: {
      ...PROFILE_STORY_ARTIST,
      image_url: undefined,
      tagline: undefined,
      location: null,
      settings: {},
    },
  },
};

/** A long name over an eight-release catalog. */
export const LongContentNameAndCatalog: Story = {
  args: {
    artist: {
      ...PROFILE_STORY_ARTIST,
      name: 'Tim White and the Los Angeles After Hours Orchestra',
    },
    releases: Array.from({ length: 8 }, (_, index) => ({
      id: `release-${index + 1}`,
      title: `Never Say A Word (Extended Club Mix) Part ${index + 1}`,
      slug: `never-say-a-word-part-${index + 1}`,
      releaseType: 'single',
      releaseDate: '2026-08-01',
      artworkUrl: '/images/avatars/tim-white.jpg',
      artistNames: ['Tim White'],
    })),
  },
};

/** The profile inside a right-to-left page. */
export const Rtl: Story = {
  args: {
    artist: {
      ...PROFILE_STORY_ARTIST,
      name: 'تيم وايت',
      tagline: 'منتج وكاتب أغانٍ ورومانسي في ساعات الليل المتأخرة.',
    },
  },
  decorators: [
    StoryFn => (
      <div dir='rtl' lang='ar'>
        <StoryFn />
      </div>
    ),
  ],
};

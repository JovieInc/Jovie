import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  advanceOnboardingProfileDraft,
  emptyOnboardingProfileDraft,
} from '@/lib/onboarding/profile-draft';
import {
  EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  type OnboardingProfileBuilderState,
  OnboardingProfileRail,
} from './OnboardingProfileRail';

const CONFIRMED_ARTIST_STATE: OnboardingProfileBuilderState = {
  artist: {
    id: 'artist-1',
    name: 'Test Artist',
    url: 'https://open.spotify.com/artist/artist-1',
    imageUrl: 'https://i.scdn.co/image/test',
    followers: 12_300,
    genres: ['progressive house'],
  },
  artistConfirmed: true,
  handle: 'testartist',
  socialLinks: [],
};

const meta = {
  title: 'Features/Onboarding/OnboardingProfileRail',
  component: OnboardingProfileRail,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof OnboardingProfileRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    state: EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  },
};

/**
 * Golden-path desktop rail at 1280×720: the app shell's right rail is ~692px
 * tall there (measured from the 2026-10-03 keyframe). The DSP strip must stay
 * clear of the phone's Listen now CTA.
 */
export const SideClearance: Story = {
  args: {
    placement: 'side',
    state: CONFIRMED_ARTIST_STATE,
  },
  render: () => (
    <div
      data-testid='onboarding-rail-clearance-fixture'
      style={{ height: 692, width: 380 }}
    >
      <OnboardingProfileRail placement='side' state={CONFIRMED_ARTIST_STATE} />
    </div>
  ),
};

const CATALOG_ARTIST_STATE: OnboardingProfileBuilderState = {
  ...CONFIRMED_ARTIST_STATE,
  artist: {
    ...(CONFIRMED_ARTIST_STATE.artist as NonNullable<
      OnboardingProfileBuilderState['artist']
    >),
    catalog: {
      total: 22,
      releases: [
        {
          id: 'release-new',
          title: 'Newest Single',
          releaseType: 'single',
          releaseDate: '2026-08-14',
          artworkUrl: null,
          spotifyUrl: 'https://open.spotify.com/album/releasenew',
        },
        {
          id: 'release-album',
          title: 'Debut Album',
          releaseType: 'album',
          releaseDate: '2025-10-01',
          artworkUrl: null,
          spotifyUrl: 'https://open.spotify.com/album/releasealbum',
        },
      ],
    },
  },
};

/**
 * JOV-9758: the matched artist's real catalog renders on the preview before
 * any pricing step (latest release on the home rail).
 */
export const WithRealCatalog: Story = {
  args: {
    placement: 'side',
    state: CATALOG_ARTIST_STATE,
  },
  render: () => (
    <div style={{ height: 692, width: 380 }}>
      <OnboardingProfileRail placement='side' state={CATALOG_ARTIST_STATE} />
    </div>
  ),
};

/** Golden-path mobile width (390×844) uses the inline rail. */
export const InlineClearance: Story = {
  args: {
    placement: 'inline',
    state: CONFIRMED_ARTIST_STATE,
  },
  render: () => (
    <div data-testid='onboarding-rail-clearance-fixture' style={{ width: 360 }}>
      <OnboardingProfileRail
        placement='inline'
        state={CONFIRMED_ARTIST_STATE}
      />
    </div>
  ),
};

const founderDraft = advanceOnboardingProfileDraft(
  emptyOnboardingProfileDraft(),
  {
    id: 'founder-story',
    text: 'I am a founder. https://company.example I want qualified buyer contact',
  }
);
if (founderDraft.selectedSource) {
  founderDraft.selectedSource.status = 'available';
  founderDraft.selectedSource.title = 'Acme product';
}

export const FounderDraft: Story = {
  args: {
    placement: 'inline',
    state: {
      ...EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
      handle: 'acme',
      profileDraft: founderDraft,
    },
  },
  render: args => (
    <>
      <OnboardingProfileRail {...args} placement='inline' />
      <div className='h-170 w-95 max-lg:hidden'>
        <OnboardingProfileRail {...args} placement='side' />
      </div>
    </>
  ),
};

export const UnavailableFounderSource: Story = {
  args: {
    placement: 'inline',
    state: {
      ...EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
      profileDraft: {
        ...founderDraft,
        selectedSource: founderDraft.selectedSource
          ? {
              ...founderDraft.selectedSource,
              status: 'unavailable',
              title: null,
            }
          : null,
      },
    },
  },
};

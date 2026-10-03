import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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

/** Golden-path desktop rail height (1280×720). The DSP strip must sit under the phone. */
export const SideClearance: Story = {
  args: {
    placement: 'side',
    state: CONFIRMED_ARTIST_STATE,
  },
  render: () => (
    <div
      data-testid='onboarding-rail-clearance-fixture'
      style={{ height: 720, width: 380 }}
    >
      <OnboardingProfileRail placement='side' state={CONFIRMED_ARTIST_STATE} />
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

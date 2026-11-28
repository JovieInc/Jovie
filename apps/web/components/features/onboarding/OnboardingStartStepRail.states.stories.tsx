import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingStartStepRail } from './OnboardingStartStepRail';
import {
  EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  type OnboardingProfileBuilderState,
} from './onboardingProfileRailState';

const LONG_NAME_STATE: OnboardingProfileBuilderState = {
  ...EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  artistConfirmed: true,
  handle: 'verylonghandlenameforthequietrailoverflowcheckacrossnarrowviewports',
  artist: {
    id: 'a1',
    name: 'A Very Long Artist Name For Overflow Checks Across Narrow Layouts',
    url: 'https://open.spotify.com/artist/a1',
  },
};

const meta = {
  title: 'Features/Onboarding/OnboardingStartStepRail/States',
  component: OnboardingStartStepRail,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <div className='system-b-onboarding-frame w-80 bg-(--app-shell-content-surface) p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OnboardingStartStepRail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: first visit, Find You is active. */
export const Empty: Story = {
  args: { state: EMPTY_ONBOARDING_PROFILE_BUILDER_STATE },
};

/** Long content: a long handle still keeps the quiet rail readable. */
export const LongContentClaim: Story = {
  args: { state: LONG_NAME_STATE },
};

/** Right to left: the quiet rail under an Arabic document direction. */
export const RtlOverflow: Story = {
  args: { state: LONG_NAME_STATE },
  decorators: [
    Story => (
      <div
        dir='rtl'
        lang='ar'
        className='system-b-onboarding-frame w-80 bg-(--app-shell-content-surface) p-4 text-primary-token'
      >
        <Story />
      </div>
    ),
  ],
};

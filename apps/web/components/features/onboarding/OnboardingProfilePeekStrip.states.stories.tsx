import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingProfilePeekStrip } from './OnboardingProfilePeekStrip';
import {
  EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  type OnboardingProfileBuilderState,
} from './onboardingProfileRailState';

const LONG_STATE: OnboardingProfileBuilderState = {
  ...EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  artistConfirmed: true,
  handle: 'verylonghandlenameforthepeekstripoverflowcheck',
  artist: {
    id: 'a1',
    name: 'A Very Long Artist Name For The Peek Strip Overflow Check',
    url: 'https://open.spotify.com/artist/a1',
  },
};

const meta = {
  title: 'Features/Onboarding/OnboardingProfilePeekStrip/States',
  component: OnboardingProfilePeekStrip,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <div className='system-b-onboarding-frame w-90 bg-(--app-shell-content-surface) p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OnboardingProfilePeekStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Permission denied: no confirmed artist yet, so the peek strip stays blank. */
export const PermissionDeniedHidden: Story = {
  args: { state: EMPTY_ONBOARDING_PROFILE_BUILDER_STATE },
};

/** Long content: a long name and handle truncate inside the peek strip. */
export const LongContentIdentity: Story = {
  args: { state: LONG_STATE },
};

/** Right to left: peek strip under an Arabic document direction. */
export const RtlOverflow: Story = {
  args: { state: LONG_STATE },
  decorators: [
    Story => (
      <div
        dir='rtl'
        lang='ar'
        className='system-b-onboarding-frame w-90 bg-(--app-shell-content-surface) p-4 text-primary-token'
      >
        <Story />
      </div>
    ),
  ],
};

import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingProfilePeekStrip } from './OnboardingProfilePeekStrip';
import { OnboardingStartStepRail } from './OnboardingStartStepRail';
import {
  EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  type OnboardingProfileBuilderState,
} from './onboardingProfileRailState';

const CLAIM_STATE: OnboardingProfileBuilderState = {
  ...EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  artistConfirmed: true,
  handle: 'testartist',
  artist: {
    id: 'a1',
    name: 'Test Artist',
    url: 'https://open.spotify.com/artist/a1',
    imageUrl:
      'https://i.scdn.co/image/ab6761610000e5eb000000000000000000000001',
  },
};

const LIVE_STATE: OnboardingProfileBuilderState = {
  ...CLAIM_STATE,
  handleConfirmed: true,
};

const meta = {
  title: 'Features/Onboarding/OnboardingStartStepRail',
  component: OnboardingStartStepRail,
  parameters: {
    layout: 'fullscreen',
    chromatic: { viewports: [390, 1440] },
  },
  decorators: [
    Story => (
      <div className='system-b-onboarding-frame min-h-screen bg-(--app-shell-content-surface) p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OnboardingStartStepRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FindYou: Story = {
  args: { state: EMPTY_ONBOARDING_PROFILE_BUILDER_STATE },
};

export const ClaimYourName: Story = {
  args: { state: CLAIM_STATE },
};

export const GoLive: Story = {
  args: { state: LIVE_STATE },
};

/** 390 composition: quiet step rail + peek strip above a fake composer. */
export const MobilePeekAboveComposer: Story = {
  args: { state: CLAIM_STATE },
  parameters: { chromatic: { viewports: [390] } },
  render: ({ state }) => (
    <div className='mx-auto flex min-h-screen w-full max-w-md flex-col justify-end gap-2 pb-4'>
      <OnboardingStartStepRail state={state} />
      <div className='flex-1' />
      <OnboardingProfilePeekStrip state={state} />
      <div
        className='rounded-2xl border border-subtle bg-surface-1 px-3 py-3 text-sm text-secondary-token'
        data-testid='story-composer-stand-in'
      >
        Message
      </div>
    </div>
  ),
};

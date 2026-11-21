import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingProfilePeekStrip } from './OnboardingProfilePeekStrip';
import {
  EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  type OnboardingProfileBuilderState,
} from './onboardingProfileRailState';

const PREVIEW_STATE: OnboardingProfileBuilderState = {
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

const meta = {
  title: 'Features/Onboarding/OnboardingProfilePeekStrip',
  component: OnboardingProfilePeekStrip,
  parameters: {
    layout: 'centered',
    chromatic: { viewports: [390] },
  },
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

export const WithDraftIdentity: Story = {
  args: { state: PREVIEW_STATE },
};

export const Empty: Story = {
  args: { state: EMPTY_ONBOARDING_PROFILE_BUILDER_STATE },
};

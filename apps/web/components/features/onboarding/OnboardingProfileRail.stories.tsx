import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  OnboardingProfileRail,
} from './OnboardingProfileRail';

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

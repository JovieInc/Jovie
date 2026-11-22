import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingDemoContent } from './OnboardingDemoContent';

const NOOP = () => {};

const meta = {
  title: 'Features/Demo/OnboardingDemoContent',
  component: OnboardingDemoContent,
  parameters: { layout: 'fullscreen' },
  args: {
    currentStep: 'handle',
    onStepChange: NOOP,
    isRevealing: false,
    onFinish: NOOP,
  },
} satisfies Meta<typeof OnboardingDemoContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HandleStep: Story = {};

export const SpotifyStep: Story = {
  args: { currentStep: 'dsp' },
};

export const FinishStep: Story = {
  args: { currentStep: 'profile-review' },
};

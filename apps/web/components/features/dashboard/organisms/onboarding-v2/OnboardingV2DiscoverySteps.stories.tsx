import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  createStepContext,
  SPARSE_SNAPSHOT,
} from './fixtures/onboardingV2StepContext';
import { OnboardingV2DiscoveryStep } from './OnboardingV2DiscoverySteps';

const meta = {
  title: 'Features/Dashboard/Onboarding/OnboardingV2DiscoverySteps',
  component: OnboardingV2DiscoveryStep,
  parameters: { layout: 'centered' },
  args: {
    ctx: createStepContext({
      currentStep: 'dsp',
      discoverySnapshot: SPARSE_SNAPSHOT,
    }),
  },
} satisfies Meta<typeof OnboardingV2DiscoveryStep>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DspMatches: Story = {};

export const DspEmpty: Story = {
  args: {
    ctx: createStepContext({
      currentStep: 'dsp',
      discoverySnapshot: { ...SPARSE_SNAPSHOT, dspItems: [] },
    }),
  },
};

export const SocialEmpty: Story = {
  args: {
    ctx: createStepContext({
      currentStep: 'social',
      discoverySnapshot: SPARSE_SNAPSHOT,
    }),
  },
};

export const ReleasePreview: Story = {
  args: {
    ctx: createStepContext({
      currentStep: 'releases',
      discoverySnapshot: SPARSE_SNAPSHOT,
    }),
  },
};

export const DiscoveryError: Story = {
  args: {
    ctx: createStepContext({
      currentStep: 'dsp',
      discoveryError: 'Failed to load onboarding discovery.',
    }),
  },
};

export const LateArrivals: Story = {
  args: {
    ctx: createStepContext({
      currentStep: 'late-arrivals',
      lateArrivals: [
        { id: 'late-1', subtitle: 'Release', title: 'A late single' },
      ],
    }),
  },
};

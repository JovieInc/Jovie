import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingPlanOffer } from './OnboardingPlanOffer';

const meta = {
  title: 'Features/Dashboard/Onboarding/OnboardingPlanOffer',
  component: OnboardingPlanOffer,
} satisfies Meta<typeof OnboardingPlanOffer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};

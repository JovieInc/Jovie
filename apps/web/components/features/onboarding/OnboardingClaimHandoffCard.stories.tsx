import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingClaimHandoffCard } from './OnboardingClaimHandoffCard';

const meta = {
  title: 'Features/Onboarding/OnboardingClaimHandoffCard',
  component: OnboardingClaimHandoffCard,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof OnboardingClaimHandoffCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Checkout: Story = {
  args: {
    handoff: { kind: 'checkout' },
  },
};

export const Waitlist: Story = {
  args: {
    handoff: { kind: 'waitlist' },
  },
};

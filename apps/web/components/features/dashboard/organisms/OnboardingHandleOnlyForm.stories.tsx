import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingHandleOnlyForm } from './OnboardingHandleOnlyForm';

const meta = {
  title: 'Features/Dashboard/Organisms/OnboardingHandleOnlyForm',
  component: OnboardingHandleOnlyForm,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['isHydrated', 'userId'],
    },
  },
} satisfies Meta<typeof OnboardingHandleOnlyForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

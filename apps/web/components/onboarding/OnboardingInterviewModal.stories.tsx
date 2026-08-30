import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingInterviewModal } from './OnboardingInterviewModal';

const meta = {
  title: 'Onboarding/OnboardingInterviewModal',
  component: OnboardingInterviewModal,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/onboarding' },
    },
    jovie: { uncoveredProps: ['disabled'] },
  },
} satisfies Meta<typeof OnboardingInterviewModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

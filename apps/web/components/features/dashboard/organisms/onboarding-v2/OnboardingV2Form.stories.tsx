import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingV2Form } from './OnboardingV2Form';

const meta = {
  title: 'Features/Dashboard/Onboarding/OnboardingV2Form',
  component: OnboardingV2Form,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
    },
    jovie: {
      uncoveredProps: ['title'],
    },
  },
  args: {
    isHydrated: true,
    userId: 'storybook-user',
    userEmail: 'artist@example.com',
    initialDisplayName: 'Avery Stone',
    initialHandle: 'averystone',
    assumeInitialHandleAvailable: true,
  },
  render: args => (
    <div className='min-h-screen bg-base'>
      <OnboardingV2Form {...args} />
    </div>
  ),
} satisfies Meta<typeof OnboardingV2Form>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HandleStep: Story = {};

export const SpotifyStep: Story = {
  args: {
    initialProfileId: 'storybook-profile',
    initialResumeStep: 'spotify',
  },
};

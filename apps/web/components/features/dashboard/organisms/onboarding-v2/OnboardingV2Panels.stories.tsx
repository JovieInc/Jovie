import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingSidebar } from './OnboardingV2Panels';

const meta = {
  title: 'Features/Dashboard/Onboarding/OnboardingV2Panels',
  component: OnboardingSidebar,
  parameters: { layout: 'centered' },
  args: {
    currentStep: 'spotify',
    onBack: () => {},
    steps: [
      { id: 'handle', label: 'Handle' },
      { id: 'spotify', label: 'Spotify' },
      { id: 'upgrade', label: 'Plan' },
      { id: 'profile-ready', label: 'Finish' },
    ],
  },
  decorators: [
    function Frame(Story) {
      return (
        <div className='w-64 p-4'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof OnboardingSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SecondStep: Story = {};

export const FirstStepWithoutBack: Story = {
  args: { currentStep: 'handle', onBack: undefined },
};

export const FinalStep: Story = {
  args: { currentStep: 'profile-ready' },
};

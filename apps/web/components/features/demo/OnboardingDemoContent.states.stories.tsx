import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingDemoContent } from './OnboardingDemoContent';

const NOOP = () => {};

const meta = {
  title: 'Features/Demo/OnboardingDemoContent/States',
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

/** Partial: the finish step with the demo profile only partly set up. */
export const PartialFinishStep: Story = {
  args: { currentStep: 'profile-review' },
};

/** Loading: the flow fades out and ignores the pointer while revealing. */
export const LoadingRevealing: Story = {
  args: { isRevealing: true },
};

/** Right to left: the flow under an Arabic document direction. */
export const RtlOverflow: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};

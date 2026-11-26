import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ReleasePlanWizard } from './ReleasePlanWizard';

const meta = {
  title: 'Dashboard/Releases/ReleasePlanWizard/States',
  component: ReleasePlanWizard,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    releaseTitle: 'The Deep End',
    isGateLoading: false,
    canGenerateReleasePlans: true,
    isGeneratingReleasePlan: false,
    onClose: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof ReleasePlanWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the plan is generating, so every control is locked. */
export const Loading: Story = { args: { isGeneratingReleasePlan: true } };

/** Long content: a release title that wraps in the heading and gate copy. */
export const LongContent: Story = {
  args: {
    releaseTitle:
      'The Extraordinarily Long Titled Deluxe Anniversary Edition of the Deep End',
  },
};

/** Rtl: right-to-left layout. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
  args: { releaseTitle: 'النهاية العميقة' },
};

/** Permission denied: the workspace plan does not include release plans. */
export const PermissionDeniedNotIncluded: Story = {
  args: { canGenerateReleasePlans: false },
};

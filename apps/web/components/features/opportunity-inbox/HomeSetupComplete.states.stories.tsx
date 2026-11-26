import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeSetupComplete } from './HomeSetupComplete';

/** Rendered states of the finished-setup home header. */
const meta = {
  title: 'Dashboard/Opportunity Inbox/Home Setup Complete/States',
  component: HomeSetupComplete,
  parameters: { layout: 'fullscreen' },
  args: {
    steps: [
      { label: 'Complete Your Profile', description: '', complete: true },
      { label: 'Connect Your Music', description: '', complete: true },
    ],
  },
} satisfies Meta<typeof HomeSetupComplete>;

export default meta;
type Story = StoryObj<typeof meta>;

const withShell: Decorator = function WithShell(Story) {
  return (
    <div className='min-h-screen bg-(--app-shell-content-surface) px-3 py-5'>
      <Story />
    </div>
  );
};

const withRtlShell: Decorator = function WithRtlShell(Story) {
  return (
    <div
      dir='rtl'
      lang='ar'
      className='min-h-screen bg-(--app-shell-content-surface) px-3 py-5'
    >
      <Story />
    </div>
  );
};

/** Empty: no steps were passed, so the popover lists nothing. */
export const EmptySteps: Story = {
  args: { steps: [] },
  decorators: [withShell],
};

/** Long content: step labels far past one line in the popover list. */
export const LongContentStepLabels: Story = {
  args: {
    steps: [
      {
        label:
          'Complete Your Artist Profile With Bio, Photo, Genres And Every Social Link',
        description: '',
        complete: true,
      },
      {
        label:
          'Connect Every Streaming Service And Confirm The Catalog Matches Your Distributor',
        description: '',
        complete: true,
      },
    ],
  },
  decorators: [withShell],
};

/** Right-to-left: Arabic step labels in an Arabic document. */
export const RtlArabicStepLabels: Story = {
  args: {
    steps: [
      { label: 'أكمل ملفك الشخصي', description: '', complete: true },
      { label: 'اربط موسيقاك', description: '', complete: true },
    ],
  },
  decorators: [withRtlShell],
};

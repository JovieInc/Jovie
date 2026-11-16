import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SettingsErrorState } from './SettingsErrorState';

/**
 * State coverage for the settings section error card. Same frame as the
 * canonical stories; each state changes only the caller copy, the retry
 * handler or the document direction.
 */
const meta = {
  title: 'Dashboard/Molecules/SettingsErrorState States',
  component: SettingsErrorState,
  parameters: {
    layout: 'centered',
  },
  render: args => (
    <div className='w-96'>
      <SettingsErrorState {...args} />
    </div>
  ),
} satisfies Meta<typeof SettingsErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: a failed section load with a retry. */
export const ErrorWithRetry: Story = {
  args: {
    title: 'Could not load notifications',
    message: 'Check your connection and try again.',
    onRetry: fn(),
  },
};

/** Partial: only a message, so the default title shows and there is no retry. */
export const PartialMessageOnly: Story = {
  args: { message: 'Billing details are unavailable right now.' },
};

/** Long content: a long title and message wrap inside the card. */
export const LongContentCopy: Story = {
  args: {
    title:
      'We could not load the connected streaming platforms for this profile',
    message:
      'The request to the platform service timed out after several attempts. Your existing links are safe and nothing has changed; try again in a moment or reload the page if this keeps happening.',
    onRetry: fn(),
  },
};

/** Right-to-left: Arabic copy inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    title: 'حدث خطأ ما',
    message: 'تعذر تحميل هذا القسم.',
    onRetry: fn(),
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};

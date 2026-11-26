import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import { FeedbackForm } from './FeedbackForm';

const meta = {
  title: 'Jovie/Components/FeedbackForm',
  component: FeedbackForm,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['onClose', 'disabled'],
    },
  },
} satisfies Meta<typeof FeedbackForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onClose: () => {},
  },
};

/** Empty: nothing typed yet, so Submit is disabled and the counter reads 0. */
export const EmptyDraft: Story = {
  args: { onClose: () => {} },
};

/** Error: submitting fails in Storybook (no API), so the form shows its retry message. */
export const ErrorSubmitFails: Story = {
  args: { onClose: () => {} },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByRole('textbox', { name: 'Your Feedback' }),
      'Search results never load'
    );
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Submit' })
    );
  },
};

/** Long content: a long note near the 2000 character limit wraps inside the field. */
export const LongContentNote: Story = {
  args: { onClose: () => {} },
  play: async ({ canvasElement }) => {
    await userEvent.type(
      await within(canvasElement).findByRole('textbox', {
        name: 'Your Feedback',
      }),
      'The release planner loses my place whenever I switch tabs and come back later. '.repeat(
        6
      ),
      { delay: 0 }
    );
  },
};

/** Rtl: the form mirrors for a right-to-left note. */
export const RtlNote: Story = {
  args: { onClose: () => {} },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
};

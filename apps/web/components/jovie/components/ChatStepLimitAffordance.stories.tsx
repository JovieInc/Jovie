import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ChatStepLimitAffordance } from './ChatStepLimitAffordance';

const meta = {
  title: 'Jovie/ChatStepLimitAffordance',
  component: ChatStepLimitAffordance,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-base p-3'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatStepLimitAffordance>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The reply stopped at the tool-step cap; Continue resubmits "continue". */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const onPrompt = fn();
    const listener = (event: Event) =>
      onPrompt((event as CustomEvent<{ prompt: string }>).detail.prompt);
    globalThis.addEventListener('jovie-chat-submit-prompt', listener);
    try {
      const canvas = within(canvasElement);
      await expect(canvas.getByRole('status')).toHaveTextContent(
        'I hit the step limit — continue?'
      );
      await userEvent.click(canvas.getByRole('button', { name: 'Continue' }));
      await expect(onPrompt).toHaveBeenCalledWith('continue');
    } finally {
      globalThis.removeEventListener('jovie-chat-submit-prompt', listener);
    }
  },
};

/** Right-to-left: the affordance inside an RTL transcript mirrors its row. */
export const RtlTranscript: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};

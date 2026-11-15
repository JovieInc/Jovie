import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ThreadComposer } from './ThreadComposer';

const dock: Decorator = function ComposerDock(Story) {
  return (
    <div className='w-full max-w-2xl'>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-full max-w-2xl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Shell/ThreadComposer',
  component: ThreadComposer,
  parameters: { layout: 'centered' },
  decorators: [dock],
  args: { placeholder: 'Reply to this chat...', onSubmit: fn() },
} satisfies Meta<typeof ThreadComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: an empty draft that submits trimmed text and clears itself. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const textbox = within(canvasElement).getByRole('textbox');
    await userEvent.type(textbox, '  Draft the release note  {Enter}');
    await expect(args.onSubmit).toHaveBeenCalledWith('Draft the release note');
    await expect(textbox).toHaveValue('');
  },
};

/** Loading: the surrounding shell is still loading data. */
export const LoadingShell: Story = {
  args: { isLoading: true },
};

/** Loading: the last submit is still in flight. */
export const LoadingSubmitting: Story = {
  args: { isSubmitting: true },
};

/** Partial: no submit handler; the draft still clears on Enter. */
export const PartialNoSubmitHandler: Story = {
  args: { onSubmit: undefined },
};

/** Long content: a placeholder long enough to truncate in the pill. */
export const LongContentPlaceholder: Story = {
  args: {
    placeholder:
      'Reply to this chat, ask for a new release plan, or tell Jovie which playlist pitches and press assets to draft next for the campaign',
  },
};

/** Right-to-left: an Arabic placeholder in an RTL thread. */
export const RtlArabic: Story = {
  args: { placeholder: 'رد على هذه المحادثة...' },
  decorators: [rtl],
};

import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { ThreadImageCard } from './ThreadImageCard';

const thread: Decorator = function ThreadColumn(Story) {
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

const PREVIEW = 'https://placehold.co/768x432/111827/f5f5f5?text=Preview';

/** State coverage for the image card; Generating, Ready and ReadyWithoutActions live in ThreadImageCard.stories.tsx. */
const meta = {
  title: 'Shell/ThreadImageCard States',
  component: ThreadImageCard,
  parameters: { layout: 'centered' },
  decorators: [thread],
  args: {
    status: 'ready',
    prompt: 'A neon-lit tour poster for a synthwave album',
    previewUrl: PREVIEW,
  },
} satisfies Meta<typeof ThreadImageCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a ready card that offers only Download. */
export const PartialDownloadOnly: Story = {
  args: { onDownload: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Download' })
    ).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Copy' })).toBeNull();
  },
};

/** Long content: a long prompt in the footer beside every toolbar action. */
export const LongContentPrompt: Story = {
  args: {
    prompt:
      'A neon-lit tour poster for a synthwave album with chrome lettering, a palm-lined coastal highway at dusk, a vintage convertible and every tour date listed down the right edge',
    onDownload: fn(),
    onCopy: fn(),
    onRegenerate: fn(),
  },
};

/** Right-to-left: an Arabic prompt while the image generates. */
export const RtlArabicGenerating: Story = {
  args: {
    status: 'generating',
    prompt: 'ملصق جولة بإضاءة نيون',
    previewUrl: undefined,
  },
  decorators: [rtl],
};

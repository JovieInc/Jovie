import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WikiPageArticle } from './WikiPageArticle';

const meta = {
  title: 'Features/Admin/Wiki/WikiPageArticle/States',
  component: WikiPageArticle,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof WikiPageArticle>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long compiled page with many paragraphs. */
export const LongContentRunbook: Story = {
  args: {
    page: {
      slug: 'ops/runbook',
      title: 'Runbook',
      compiled_truth: Array.from(
        { length: 12 },
        (_, i) =>
          `## Step ${i + 1}\n\nRestart the lane worker, confirm the queue drains and note the time in the incident log before moving on.`
      ).join('\n\n'),
    },
  },
};

/** Right-to-left: an Arabic compiled page. */
export const RtlArticle: Story = {
  args: {
    page: {
      slug: 'ops/arabic',
      title: 'دليل',
      compiled_truth:
        '# دليل التشغيل\n\nأعد تشغيل العامل وتأكد من تفريغ قائمة الانتظار.',
    },
  },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};

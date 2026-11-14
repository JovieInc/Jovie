import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, Suspense, use, useMemo } from 'react';
import { expect, within } from 'storybook/test';
import { WikiPageArticle as WikiPageArticleAsync } from './WikiPageArticle';

interface WikiPageArticleStoryProps {
  readonly page: {
    readonly slug: string;
    readonly title: string;
    readonly compiled_truth?: string;
  };
}

// WikiPageArticle is an async server component; unwrap it with `use` so the
// story can preview the resolved article inside a Suspense boundary.
function WikiPageArticle({ page }: WikiPageArticleStoryProps) {
  const article = useMemo(() => WikiPageArticleAsync({ page }), [page]);
  return use(article);
}

function ArticleDecorator(Story: () => ReactNode) {
  return (
    <div className='max-w-160'>
      <Suspense
        fallback={<p className='text-secondary-token'>Loading article…</p>}
      >
        <Story />
      </Suspense>
    </div>
  );
}

function RtlArticleDecorator(Story: () => ReactNode) {
  return (
    <div className='max-w-160' dir='rtl'>
      <Suspense
        fallback={<p className='text-secondary-token'>Loading article…</p>}
      >
        <Story />
      </Suspense>
    </div>
  );
}

const LONG_PARAGRAPH =
  'Restart the lane worker, then verify the queue drains. If the queue does not drain within ten minutes, check the lane gate, the deploy receipt and the worker logs in that order, and write down what each one showed before changing anything else.';

const LONG_DOCUMENT = [
  '# Runbook for the lane worker, the queue drain check and the follow-up receipts',
  ...Array.from(
    { length: 6 },
    (_, index) => `## Step ${index + 1}\n\n${LONG_PARAGRAPH}`
  ),
  '`pnpm --filter @jovie/web exec vitest run components/features/admin/wiki/WikiPageArticle.test.tsx --reporter=verbose`',
].join('\n\n');

/** State coverage for the wiki article: a long document and RTL. */
const meta = {
  title: 'Features/Admin/WikiPageArticle States',
  component: WikiPageArticle,
  parameters: { layout: 'padded' },
  args: {
    page: {
      slug: 'ops/runbook',
      title: 'Runbook',
      compiled_truth: LONG_DOCUMENT,
    },
  },
} satisfies Meta<typeof WikiPageArticle>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: many sections and a long command stay inside the column. */
export const LongContentDocument: Story = {
  decorators: [ArticleDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('heading', { name: 'Step 6' })
    ).toBeVisible();
  },
};

/** Right-to-left: headings and paragraphs inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    page: {
      slug: 'ops/runbook-ar',
      title: 'دليل التشغيل',
      compiled_truth:
        '# دليل التشغيل\n\nأعد تشغيل العامل ثم تحقق من أن قائمة الانتظار تفرغ.\n\n## التحقق\n\nتأكد من أن البوابة خضراء.',
    },
  },
  decorators: [RtlArticleDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('heading', { name: 'دليل التشغيل' })
    ).toBeVisible();
  },
};

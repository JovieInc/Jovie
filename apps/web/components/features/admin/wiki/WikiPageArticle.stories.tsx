import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Suspense, use, useMemo } from 'react';
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

const meta = {
  title: 'Features/Admin/WikiPageArticle',
  component: WikiPageArticle,
  parameters: {
    layout: 'padded',
  },
  args: {
    page: {
      slug: 'ops/runbook',
      title: 'Runbook',
      compiled_truth:
        '# Runbook\n\nRestart the lane worker, then verify the queue drains.\n\n## Verify\n\nCheck the lane gate is green.',
    },
  },
  decorators: [
    Story => (
      <div className='max-w-160'>
        <Suspense
          fallback={<p className='text-secondary-token'>Loading article…</p>}
        >
          <Story />
        </Suspense>
      </div>
    ),
  ],
} satisfies Meta<typeof WikiPageArticle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithContent: Story = {};

export const Empty: Story = {
  args: {
    page: { slug: 'ops/empty', title: 'Empty' },
  },
};

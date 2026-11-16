import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { WikiSearchResults } from './WikiSearchResults';

const meta = {
  title: 'Features/Admin/WikiSearchResults',
  component: WikiSearchResults,
  parameters: {
    layout: 'padded',
  },
  args: {
    query: 'deploy',
    results: [
      {
        slug: 'ops/deploys',
        title: 'Deploy checklist',
        score: 0.92,
        chunk_text: 'Run the canary, watch the error budget, then promote.',
      },
      {
        slug: 'ops/rollback',
        title: 'Rollback',
        score: 0.71,
        chunk_text: 'Revert the alias to the previous deployment.',
      },
    ],
  },
} satisfies Meta<typeof WikiSearchResults>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: the search matched nothing, so only the zero count shows. */
export const EmptyResults: Story = {
  args: { query: 'nonexistent topic', results: [] },
};

/** Partial: results missing a title or excerpt fall back to the slug. */
export const PartialResults: Story = {
  args: {
    query: 'runbook',
    results: [
      { slug: 'ops/on-call-runbook', title: '' },
      { slug: 'ops/runbook', title: 'Runbook', chunk_text: '' },
    ],
  },
};

/** Long content: a long query, long titles and excerpts clamped to two lines. */
export const LongContentResults: Story = {
  args: {
    query: 'what to do when the production canary fails its health checks',
    results: Array.from({ length: 6 }, (_, index) => ({
      slug: `engineering/incidents/canary-failure-${index + 1}`,
      title: `Handling a failed production canary after promotion, case ${index + 1}`,
      chunk_text:
        'When the canary fails its health checks, stop the promotion, revert the alias to the last healthy deployment, open an incident, page the on-call owner and keep the error budget dashboard open until traffic settles.',
    })),
  },
};

const withRtl: Decorator = function WithRtl(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** RTL: Arabic results in a right-to-left container. */
export const RtlResults: Story = {
  decorators: [withRtl],
  args: {
    query: 'النشر',
    results: [
      {
        slug: 'العمليات/النشر',
        title: 'قائمة التحقق من النشر',
        chunk_text: 'شغّل الإصدار التجريبي ثم راقب الأخطاء قبل الترقية.',
      },
    ],
  },
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { BlogPost, BlogPostSummary } from '@/lib/blog/getBlogPosts';
import type { ResolvedAuthor } from '@/lib/blog/resolveAuthor';
import { BlogPostPage } from './BlogPostPage';

/**
 * State coverage for the blog post body. These start from the canonical
 * release-rhythm fixture in BlogPostPage.stories.tsx and change only the post,
 * its related posts or the document direction.
 */
const post: BlogPost = {
  slug: 'release-rhythm',
  title: 'Release rhythm',
  date: '2026-01-15',
  author: 'Jovie',
  category: 'Artist strategy',
  tags: ['release strategy'],
  excerpt: 'A calm operating rhythm for every release.',
  readingTime: 4,
  wordCount: 760,
  html: '<h2 id="ship">Ship with context</h2><p>Keep the next action, credits, and collaborators visible in one durable release record.</p><h2 id="learn">Learn without drift</h2><p>Carry verified results into the next release instead of rebuilding the plan.</p>',
  toc: [
    { id: 'ship', title: 'Ship with context', level: 2 },
    { id: 'learn', title: 'Learn without drift', level: 2 },
  ],
};

const author: ResolvedAuthor = {
  name: 'Jovie',
  title: 'Artist operations',
  avatarUrl: null,
  isVerified: true,
};

const meta = {
  title: 'Organisms/BlogPostPage States',
  component: BlogPostPage,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/blog/release-rhythm', query: {} },
    },
  },
  args: {
    post,
    author,
    toc: post.toc,
    relatedPosts: [],
    relatedAuthors: new Map(),
  },
} satisfies Meta<typeof BlogPostPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a short note with no headings and no related posts. */
export const EmptyContentsAndRelated: Story = {
  args: {
    post: {
      ...post,
      html: '<p>One short paragraph with no section headings.</p>',
      toc: [],
    },
    toc: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('One short paragraph with no section headings.')
    ).toBeVisible();
  },
};

const LONG_TITLE =
  'The release rhythm that keeps independent artists shipping every six weeks without burning out their team, their fans or their budget';

const related: BlogPostSummary[] = Array.from({ length: 3 }, (_, index) => ({
  slug: `related-${index + 1}`,
  title: `Related post ${index + 1} with a long title that wraps onto a second line`,
  date: '2026-01-10',
  author: 'Jovie',
  category: 'Artist strategy',
  tags: [],
  excerpt: 'A related excerpt.',
  readingTime: 3,
  wordCount: 500,
}));

/** Long content: a long title and lede with three related posts. */
export const LongContentWithRelated: Story = {
  args: {
    post: {
      ...post,
      title: LONG_TITLE,
      excerpt:
        'A calm operating rhythm for every release, written out at length so the lede wraps across several lines at every width and the header still reads cleanly.',
    },
    relatedPosts: related,
    relatedAuthors: new Map(related.map(item => [item.slug, author])),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 1, name: LONG_TITLE })
    ).toBeVisible();
  },
};

/** Right-to-left: an Arabic post inside an RTL document. */
export const RtlArabicPost: Story = {
  args: {
    post: {
      ...post,
      title: 'إيقاع الإصدار',
      excerpt: 'إيقاع هادئ لكل إصدار.',
      html: '<h2 id="ship">انشر مع السياق</h2><p>اجعل الخطوة التالية مرئية دائمًا.</p>',
      toc: [{ id: 'ship', title: 'انشر مع السياق', level: 2 }],
    },
    toc: [{ id: 'ship', title: 'انشر مع السياق', level: 2 }],
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'إيقاع الإصدار' })
    ).toBeVisible();
  },
};

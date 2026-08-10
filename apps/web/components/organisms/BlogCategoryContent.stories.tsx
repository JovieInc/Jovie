import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BlogCard } from '@/app/(marketing)/blog/components/BlogCard';
import type { BlogCategory } from '@/lib/blog/categories';
import type {
  BlogPostSummary,
  ResolvedAuthor,
} from '@/lib/blog/presentation-contracts';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingFullscreenParameters,
} from '../marketing/storybook/marketingStoryMeta';
import { BlogCategoryContent } from './BlogCategoryContent';

/** Parsed from the checked-in apps/web/content/blog/the-contact-problem.md. */
export const BLOG_CATEGORY_STORY_CATEGORY: BlogCategory = {
  name: 'Artist Management',
  slug: 'artist-management',
  description:
    'Insights on navigating the business side of music — managers, agents, and the systems that connect artists to opportunities.',
};

/** Exact public fields parsed from the checked-in blog post. */
export const BLOG_CATEGORY_STORY_POST: BlogPostSummary = {
  slug: 'the-contact-problem',
  title: 'The Contact Problem',
  date: '2026-03-18',
  author: 'Tim White',
  category: 'Artist Management',
  excerpt:
    "When I fired my manager, the first thing I realized wasn't emotional. It was logistical.",
  readingTime: 5,
  wordCount: 978,
  tags: ['contact info', 'manager changes', 'booking agents', 'music industry'],
};

const BLOG_CATEGORY_STORY_AUTHOR = {
  name: BLOG_CATEGORY_STORY_POST.author,
  avatarUrl: null,
  isVerified: false,
} satisfies ResolvedAuthor;

/** Merge commit that introduced the shared route/story body in PR #15708. */
export const BLOG_CATEGORY_STORY_RECEIPT = {
  registryId: 'web-024-blog--category--[slug]',
  route: '/blog/category/artist-management',
  source: 'apps/web/components/organisms/BlogCategoryContent.tsx',
  sourceExport: 'BlogCategoryContent',
  storyExport: 'Web024ArtistManagement',
  sourceSha: '916d0bddd91c065aa01b387adc2acd189391b040',
  fixture: 'content/blog/the-contact-problem.md',
} as const;

const meta = {
  title: 'Marketing/Routes/BlogCategory',
  component: BlogCategoryContent,
  excludeStories: /^BLOG_CATEGORY_STORY_/,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Shared production category shell for web-024-blog--category--[slug]. Route params, metadata, notFound handling, filesystem loading, and profile enrichment remain route-owned. The deterministic story supplies checked-in Artist Management data to the same production BlogCard.`,
      },
    },
    pen: BLOG_CATEGORY_STORY_RECEIPT,
  },
  tags: ['autodocs'],
  args: {
    category: BLOG_CATEGORY_STORY_CATEGORY,
    hasPosts: true,
  },
} satisfies Meta<typeof BlogCategoryContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web024ArtistManagement: Story = {
  name: 'web-024 /blog/category/artist-management',
  render: args => (
    <BlogCategoryContent {...args}>
      <BlogCard
        post={BLOG_CATEGORY_STORY_POST}
        author={BLOG_CATEGORY_STORY_AUTHOR}
      />
    </BlogCategoryContent>
  ),
};

export const Empty: Story = {
  args: { hasPosts: false },
};

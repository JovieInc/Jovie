import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { BlogCategory } from '@/lib/blog/categories';
import type { StoryBlogPost } from '../marketing/storybook/fixtures';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingFullscreenParameters,
} from '../marketing/storybook/marketingStoryMeta';
import { StoryBlogCard } from '../marketing/storybook/StoryBlogCard';
import { BlogCategoryContent } from './BlogCategoryContent';

/** Parsed from the checked-in apps/web/content/blog/the-contact-problem.md. */
export const BLOG_CATEGORY_STORY_CATEGORY: BlogCategory = {
  name: 'Artist Management',
  slug: 'artist-management',
  description:
    'Insights on navigating the business side of music — managers, agents, and the systems that connect artists to opportunities.',
};

/** Exact public fields parsed from the checked-in blog post. */
export const BLOG_CATEGORY_STORY_POST: StoryBlogPost = {
  slug: 'the-contact-problem',
  title: 'The Contact Problem',
  date: '2026-03-18',
  author: 'Tim White',
  category: 'Artist Management',
  excerpt:
    "When I fired my manager, the first thing I realized wasn't emotional. It was logistical.",
  readingTime: 5,
};

const meta = {
  title: 'Marketing/Routes/BlogCategory',
  component: BlogCategoryContent,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Shared production category shell for web-024-blog--category--[slug]. Route params, metadata, notFound handling, filesystem loading, profile enrichment, and the production BlogCard remain route-owned. The deterministic story supplies the existing fixture-safe card with fields from the checked-in Artist Management post.`,
      },
    },
    pen: {
      registryId: 'web-024-blog--category--[slug]',
      route: '/blog/category/artist-management',
      source: 'apps/web/components/organisms/BlogCategoryContent.tsx',
      sourceSha: '0892cccf39d72c62890ad4bc797cfd6f2d651af6',
      fixture: 'content/blog/the-contact-problem.md',
    },
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
      <StoryBlogCard post={BLOG_CATEGORY_STORY_POST} />
    </BlogCategoryContent>
  ),
};

export const Empty: Story = {
  args: { hasPosts: false },
};

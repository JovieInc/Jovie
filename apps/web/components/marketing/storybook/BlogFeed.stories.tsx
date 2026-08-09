import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BlogFeed, type BlogFeedEntry } from '@/app/(marketing)/blog/BlogFeed';
import type { BlogPostSummary } from '@/lib/blog/getBlogPosts';
import { STORY_BLOG_POSTS } from './fixtures';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingFullscreenParameters,
} from './marketingStoryMeta';

const entries: readonly BlogFeedEntry[] = STORY_BLOG_POSTS.map(post => ({
  post: {
    ...post,
    tags: [],
    wordCount: post.readingTime * 238,
  } satisfies BlogPostSummary,
  author: {
    name: post.author,
    avatarUrl: null,
    isVerified: false,
  },
}));

const meta = {
  title: 'Marketing/Routes/BlogIndex',
  component: BlogFeed,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Exact production presentation for web-025-blog. Route data loading remains in BlogIndexPage; this story supplies a deterministic three-post fixture to the same BlogFeed body.`,
      },
    },
    pen: {
      registryId: 'web-025-blog',
      route: '/blog',
      source: 'apps/web/app/(marketing)/blog/BlogFeed.tsx',
      fixture: 'deterministic-three-posts',
    },
  },
  tags: ['autodocs'],
  args: { entries },
} satisfies Meta<typeof BlogFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { entries: [] },
};

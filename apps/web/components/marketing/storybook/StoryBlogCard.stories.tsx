import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { STORY_BLOG_POSTS } from './fixtures';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingCenteredParameters,
} from './marketingStoryMeta';
import { StoryBlogCard } from './StoryBlogCard';

/**
 * Production blog card with browser-safe deterministic data.
 * Used by Marketing/Recipes/blog-landing and Marketing/Sections compositions.
 */
const meta = {
  title: 'Marketing/Fixtures/StoryBlogCard',
  component: StoryBlogCard,
  parameters: {
    ...marketingCenteredParameters,
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Production BlogCard rendered with browser-safe deterministic data.`,
      },
    },
  },
  tags: ['autodocs'],
  args: {
    post: STORY_BLOG_POSTS[0],
    variant: 'default',
  },
} satisfies Meta<typeof StoryBlogCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: 'default',
  render: args => (
    <div className='mx-auto max-w-md p-8'>
      <StoryBlogCard {...args} />
    </div>
  ),
};

export const Featured: Story = {
  name: 'featured',
  args: {
    post: STORY_BLOG_POSTS[0],
    variant: 'featured',
  },
  render: args => (
    <div className='mx-auto max-w-3xl p-8'>
      <StoryBlogCard {...args} />
    </div>
  ),
};

/** Published frontmatter plus the canonical O64tu media variants. */
export const CanonicalEditorial: Story = {
  render: () => (
    <div className='grid grid-cols-1 gap-12 p-6 md:grid-cols-3'>
      {[
        {
          slug: 'the-suno-playbook-teardown',
          title: 'The $100K Suno Playbook Is Missing the Hard Part',
          date: '2026-07-04',
          category: 'Music Business',
        },
        {
          slug: 'the-contact-problem',
          title: 'The Contact Problem',
          date: '2026-03-18',
          category: 'Artist Management',
        },
        {
          slug: 'the-myspace-problem',
          title: 'The MySpace Problem',
          date: '2025-02-03',
          category: 'Inbound Marketing',
        },
      ].map(post => (
        <StoryBlogCard
          key={post.slug}
          post={{ ...post, author: 'Tim White', excerpt: '', readingTime: 0 }}
        />
      ))}
    </div>
  ),
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { STORY_BLOG_POSTS } from './fixtures';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingCenteredParameters,
} from './marketingStoryMeta';
import { StoryBlogCard } from './StoryBlogCard';

/**
 * Storybook-only blog card fixture (no node:fs BlogCard path).
 * Used by Marketing/Recipes/blog-landing and Marketing/Sections compositions.
 */
const meta = {
  title: 'Marketing/Fixtures/StoryBlogCard',
  component: StoryBlogCard,
  parameters: {
    ...marketingCenteredParameters,
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Fixture card mirrors product blog card grammar without filesystem imports.`,
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

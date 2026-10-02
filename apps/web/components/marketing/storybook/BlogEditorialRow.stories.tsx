import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BlogEditorialRow } from '@/app/(marketing)/blog/components/BlogEditorialRow';
import { BLOG_EDITORIAL_POSTS } from './blogEditorialFixtures';
import { marketingFullscreenParameters } from './marketingStoryMeta';

const meta = {
  title: 'Marketing/Fixtures/BlogEditorialRow',
  component: BlogEditorialRow,
  parameters: marketingFullscreenParameters,
  tags: ['autodocs'],
  args: {
    entries: BLOG_EDITORIAL_POSTS.map(post => ({
      post,
      author: { name: post.author, avatarUrl: null, isVerified: false },
    })),
  },
} satisfies Meta<typeof BlogEditorialRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FourArticles: Story = {};
export const Partial: Story = {
  args: { entries: meta.args.entries.slice(0, 1) },
};
export const Empty: Story = { args: { entries: [] } };
export const LongTitle: Story = {
  args: {
    entries: meta.args.entries.map((entry, index) =>
      index === 0
        ? {
            ...entry,
            post: {
              ...entry.post,
              title:
                'A longer editorial title that remains complete and readable across several lines on smaller screens',
            },
          }
        : entry
    ),
  },
};

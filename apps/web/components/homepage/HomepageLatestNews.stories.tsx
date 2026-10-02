import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BLOG_EDITORIAL_POSTS } from '@/components/marketing/storybook/blogEditorialFixtures';
import { marketingFullscreenParameters } from '@/components/marketing/storybook/marketingStoryMeta';
import { HomepageLatestNews } from './HomepageLatestNews';

const meta = {
  title: 'Marketing/HomepageLatestNews',
  component: HomepageLatestNews,
  parameters: marketingFullscreenParameters,
  args: { posts: BLOG_EDITORIAL_POSTS },
} satisfies Meta<typeof HomepageLatestNews>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FourArticles: Story = {};
export const Partial: Story = {
  args: { posts: BLOG_EDITORIAL_POSTS.slice(0, 1) },
};
export const Empty: Story = { args: { posts: [] } };

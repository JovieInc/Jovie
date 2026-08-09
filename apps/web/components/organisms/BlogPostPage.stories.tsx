import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { BlogPost } from '@/lib/blog/getBlogPosts';
import type { ResolvedAuthor } from '@/lib/blog/resolveAuthor';
import { BlogPostPage } from './BlogPostPage';

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
  title: 'Organisms/BlogPostPage',
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

export const Canonical: Story = {};

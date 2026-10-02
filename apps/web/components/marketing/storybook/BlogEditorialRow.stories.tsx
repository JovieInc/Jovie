import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BlogEditorialRow } from '@/app/(marketing)/blog/components/BlogEditorialRow';
import { marketingFullscreenParameters } from './marketingStoryMeta';

const posts = [
  {
    slug: 'the-suno-playbook-teardown',
    title: 'The $100K Suno Playbook Is Missing the Hard Part',
    date: '2026-07-04',
    author: 'Tim White',
    category: 'Music Business',
    excerpt: '',
    image: '/images/blog/suno-playbook.svg',
    imageAlt:
      'Abstract artwork for The $100K Suno Playbook Is Missing the Hard Part.',
    readingTime: 1,
  },
  {
    slug: 'the-contact-problem',
    title: 'The Contact Problem',
    date: '2026-03-18',
    author: 'Tim White',
    category: 'Artist Management',
    excerpt: '',
    image: '/images/blog/contact-problem.svg',
    imageAlt: 'Abstract artwork for The Contact Problem.',
    readingTime: 1,
  },
  {
    slug: 'the-myspace-problem',
    title: 'The MySpace Problem',
    date: '2025-02-03',
    author: 'Tim White',
    category: 'Inbound Marketing',
    excerpt: '',
    image: '/images/blog/myspace-problem.svg',
    imageAlt: 'Abstract artwork for The MySpace Problem.',
    readingTime: 1,
  },
  {
    slug: 'the-friday-problem',
    title: 'The Friday Problem',
    date: '2025-01-15',
    author: 'Tim White',
    category: 'Release Strategy',
    excerpt: 'Most artists make the same mistake.',
    image: '/images/blog/friday-problem.svg',
    imageAlt: 'Abstract artwork for The Friday Problem.',
    readingTime: 1,
  },
];

const meta = {
  title: 'Marketing/Fixtures/BlogEditorialRow',
  component: BlogEditorialRow,
  parameters: marketingFullscreenParameters,
  tags: ['autodocs'],
  args: {
    entries: posts.map(post => ({
      post: { ...post, tags: [], wordCount: 0 },
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

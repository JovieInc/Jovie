import type { BlogPostSummary } from '@/lib/blog/presentation-contracts';

export const BLOG_EDITORIAL_POSTS: readonly BlogPostSummary[] = [
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
].map(post => ({ ...post, tags: [], wordCount: 0 }));

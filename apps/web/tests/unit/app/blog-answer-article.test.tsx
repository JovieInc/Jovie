import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: {
    slug: 'what-is-a-smart-link-for-music',
    title: 'What is a smart link for music?',
    description: 'A smart link opens your release in each fan’s own music app.',
    question: 'What is a smart link used for?',
    answer: 'A smart link is one URL for a release that opens the fan’s app.',
    excerpt: 'A smart link is one URL for a release that opens the fan’s app.',
    date: '2026-09-27',
    author: 'Jovie',
    tags: ['smart links'],
    readingTime: 3,
    wordCount: 700,
    html: '<p>body</p>',
    toc: [],
  } as Record<string, unknown>,
}));

vi.mock('@/lib/blog/getBlogPosts', () => ({
  getBlogPost: async () => mocks.post,
  getBlogPostSlugs: async () => [mocks.post.slug],
  getRelatedPosts: async () => [],
}));
vi.mock('@/lib/services/profile', () => ({
  getProfileByUsername: async () => null,
  getProfilesByUsernames: async () => new Map(),
}));
vi.mock('@/components/organisms/BlogPostPage', () => ({
  BlogPostPage: () => <article>post</article>,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

import BlogPostRoute, {
  generateMetadata,
} from '@/app/(marketing)/blog/[slug]/page';

const params = Promise.resolve({ slug: 'what-is-a-smart-link-for-music' });

describe('blog answer articles', () => {
  beforeEach(() => {
    mocks.post.description =
      'A smart link opens your release in each fan’s own music app.';
    mocks.post.question = 'What is a smart link used for?';
  });

  it('prefers the frontmatter description for meta tags', async () => {
    const metadata = await generateMetadata({ params });
    expect(metadata.description).toBe(mocks.post.description);
    expect(metadata.openGraph).toMatchObject({
      description: mocks.post.description,
    });
  });

  it('falls back to the excerpt without a description', async () => {
    mocks.post.description = undefined;
    const metadata = await generateMetadata({ params });
    expect(metadata.description).toBe(mocks.post.excerpt);
  });

  it('emits FAQPage JSON-LD only for answer articles', async () => {
    const types = async () => {
      const { container, unmount } = render(await BlogPostRoute({ params }));
      const found = [
        ...container.querySelectorAll('script[type="application/ld+json"]'),
      ].map(node => JSON.parse(node.textContent ?? '{}')['@type']);
      unmount();
      return found;
    };
    expect(await types()).toEqual(['Article', 'BreadcrumbList', 'FAQPage']);
    mocks.post.question = undefined;
    expect(await types()).toEqual(['Article', 'BreadcrumbList']);
  });
});

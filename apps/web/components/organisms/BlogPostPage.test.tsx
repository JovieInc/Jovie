import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BlogPost } from '@/lib/blog/getBlogPosts';
import type { ResolvedAuthor } from '@/lib/blog/resolveAuthor';

vi.mock('@/components/features/share/PublicShareMenu', () => ({
  PublicShareMenu: () => <button type='button'>Share</button>,
}));

vi.mock('@/components/molecules/Avatar', () => ({
  Avatar: ({ alt }: { readonly alt: string }) => (
    <span role='img' aria-label={alt} />
  ),
}));

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
  html: '<h2 id="ship">Ship with context</h2><p>Keep the next action visible.</p>',
  toc: [{ id: 'ship', title: 'Ship with context', level: 2 }],
};

const author: ResolvedAuthor = {
  name: 'Jovie',
  title: 'Artist operations',
  avatarUrl: null,
  isVerified: true,
};

describe('BlogPostPage', () => {
  it('composes the canonical content-prose body', () => {
    render(
      <BlogPostPage
        post={post}
        author={author}
        toc={post.toc}
        relatedPosts={[]}
        relatedAuthors={new Map()}
      />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Release rhythm' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Article content' })
    ).toHaveAttribute('data-marketing-section', 'content-prose');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Ship with context' })
    ).toBeInTheDocument();
  });
});

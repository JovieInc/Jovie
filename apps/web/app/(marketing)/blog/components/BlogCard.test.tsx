import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BlogPostSummary } from '@/lib/blog/presentation-contracts';
import { BlogCard } from './BlogCard';
import { BlogRelatedPosts } from './BlogRelatedPosts';

const author = { name: 'Tim White', avatarUrl: null, isVerified: false };
const post: BlogPostSummary = {
  slug: 'the-suno-playbook-teardown',
  title: 'The $100K Suno Playbook Is Missing the Hard Part',
  date: '2026-07-04',
  author: 'Tim White',
  category: 'Music Business',
  excerpt: 'Distribution is the starting gun.',
  tags: [],
  readingTime: 8,
  wordCount: 1600,
};

describe('BlogCard editorial navigation', () => {
  it.each(['default', 'featured'] as const)(
    'preserves the full article and category destinations in the %s variant',
    variant => {
      const { container } = render(
        <BlogCard post={post} author={author} variant={variant} />
      );
      const articleLink = screen.getByRole('link', { name: post.title });
      expect(articleLink).toHaveAttribute('href', `/blog/${post.slug}`);
      expect(
        screen.getByRole('link', { name: 'Music Business' })
      ).toHaveAttribute('href', '/blog/category/music-business');
      expect(container.querySelector('a a')).toBeNull();
      expect(screen.getByRole('heading', { name: post.title })).not.toHaveClass(
        'line-clamp-2'
      );
      expect(container.querySelector('img')).toHaveAttribute('alt', '');
      expect(container.querySelector('img')?.getAttribute('src')).toContain(
        'suno-playbook.svg'
      );
      expect(container.querySelector('time')).toHaveTextContent('July 4, 2026');
    }
  );

  it('keeps a new article navigable without artwork or a category', () => {
    const { container } = render(
      <BlogCard
        post={{ ...post, slug: 'new-article', category: undefined }}
        author={author}
      />
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: post.title })).toHaveAttribute(
      'href',
      '/blog/new-article'
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('By Tim White')).toBeInTheDocument();
  });

  it('omits related entries without resolved authors and handles an empty feed', () => {
    const { rerender } = render(
      <BlogRelatedPosts posts={[]} authors={new Map()} />
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    rerender(
      <BlogRelatedPosts
        posts={[post, { ...post, slug: 'unresolved-author' }]}
        authors={new Map([[post.slug, author]])}
      />
    );
    expect(screen.getAllByRole('link', { name: post.title })).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Related Posts' })).toBeVisible();
  });
});

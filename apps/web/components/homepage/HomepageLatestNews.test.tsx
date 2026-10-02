import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBlogPosts } from '@/lib/blog/getBlogPosts';
import type { BlogPostSummary } from '@/lib/blog/presentation-contracts';
import { HomepageLatestNews } from './HomepageLatestNews';

vi.mock('@/lib/blog/getBlogPosts', async () => {
  const publication = await import('@/lib/blog/publication');
  return {
    getBlogPosts: vi.fn(),
    isBlogPostIndexable: publication.isBlogPostIndexable,
  };
});

function post(slug: string): BlogPostSummary {
  return {
    slug,
    title: slug,
    date: '2026-07-04',
    author: 'Tim White',
    tags: [],
    excerpt: '',
    readingTime: 1,
    wordCount: 100,
  };
}

describe('HomepageLatestNews', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the four indexed articles and excludes unregistered content', async () => {
    vi.mocked(getBlogPosts).mockResolvedValue([
      post('private-draft'),
      post('the-suno-playbook-teardown'),
      post('the-contact-problem'),
      post('the-myspace-problem'),
      post('the-friday-problem'),
    ]);
    render(await HomepageLatestNews());
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(
      screen.queryByRole('link', { name: 'private-draft' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'the-friday-problem' })
    ).toHaveAttribute('href', '/blog/the-friday-problem');
  });

  it('has no pending client state and renders nothing for an empty published catalog', async () => {
    vi.mocked(getBlogPosts).mockResolvedValue([]);
    render(await HomepageLatestNews());
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('propagates invalid catalog errors rather than substituting fabricated cards', async () => {
    vi.mocked(getBlogPosts).mockRejectedValue(
      new Error('Invalid publication catalog')
    );
    await expect(HomepageLatestNews()).rejects.toThrow(
      'Invalid publication catalog'
    );
  });
});

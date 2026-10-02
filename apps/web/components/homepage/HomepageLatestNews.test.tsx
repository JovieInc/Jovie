import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BlogPostSummary } from '@/lib/blog/presentation-contracts';
import { HomepageLatestNews } from './HomepageLatestNews';
import meta, { Empty, Partial } from './HomepageLatestNews.stories';

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
  it('uses the four indexed articles and excludes unregistered content', () => {
    const posts = [
      post('private-draft'),
      post('the-suno-playbook-teardown'),
      post('the-contact-problem'),
      post('the-myspace-problem'),
      post('the-friday-problem'),
    ];
    render(<HomepageLatestNews posts={posts} />);
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(
      screen.queryByRole('link', { name: 'private-draft' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'the-friday-problem' })
    ).toHaveAttribute('href', '/blog/the-friday-problem');
  });

  it('has no pending client state and renders nothing for an empty published catalog', () => {
    render(<HomepageLatestNews posts={[]} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders its real Storybook catalog states without a server loader', () => {
    const { rerender } = render(<meta.component {...meta.args} />);
    expect(screen.getAllByRole('article')).toHaveLength(4);
    rerender(<meta.component {...meta.args} {...Partial.args} />);
    expect(screen.getAllByRole('article')).toHaveLength(1);
    rerender(<meta.component {...meta.args} {...Empty.args} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});

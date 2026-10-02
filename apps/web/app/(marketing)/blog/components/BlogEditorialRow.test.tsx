import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { BlogFeedEntry } from '../BlogFeed';
import { BlogEditorialRow } from './BlogEditorialRow';

const entries: BlogFeedEntry[] = Array.from({ length: 5 }, (_, index) => ({
  post: {
    slug: `article-${index}`,
    title: `Article ${index}: a complete title that remains readable when it wraps`,
    date: '2026-07-04',
    author: 'Tim White',
    category: 'Music Business',
    excerpt: '',
    tags: [],
    image: '/images/blog/suno-playbook.svg',
    imageAlt: 'Abstract editorial artwork.',
    readingTime: 8,
    wordCount: 1600,
  },
  author: { name: 'Tim White', avatarUrl: null, isVerified: false },
}));

describe('BlogEditorialRow', () => {
  it('shows at most four real articles with metadata before their complete titles', () => {
    render(<BlogEditorialRow entries={entries} />);
    const section = screen.getByRole('region', { name: 'Latest news' });
    const articles = within(section).getAllByRole('article');
    expect(articles).toHaveLength(4);
    expect(
      within(section).getByRole('link', { name: 'All posts' })
    ).toHaveAttribute('href', '/blog');
    expect(
      within(section).queryByRole('link', { name: entries[4].post.title })
    ).not.toBeInTheDocument();
    for (const [index, article] of articles.entries()) {
      const title = within(article).getByRole('heading', {
        level: 3,
        name: entries[index].post.title,
      });
      const date = article.querySelector('time');
      expect(date).toHaveAttribute('dateTime', '2026-07-04');
      expect(
        (date?.compareDocumentPosition(title) ?? 0) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(within(article).getAllByRole('link')).toHaveLength(1);
      expect(
        within(article).getByRole('link', { name: entries[index].post.title })
      ).toHaveAttribute('href', `/blog/article-${index}`);
      expect(title).not.toHaveClass('line-clamp-2');
    }
  });

  it('preserves native keyboard order from All posts through each article', async () => {
    const user = userEvent.setup();
    render(<BlogEditorialRow entries={entries.slice(0, 2)} />);
    await user.tab();
    expect(screen.getByRole('link', { name: 'All posts' })).toHaveFocus();
    for (const entry of entries.slice(0, 2)) {
      await user.tab();
      expect(
        screen.getByRole('link', { name: entry.post.title })
      ).toHaveFocus();
    }
  });

  it('renders partial content without padding, and omits an empty section', () => {
    const { rerender } = render(
      <BlogEditorialRow entries={entries.slice(0, 1)} />
    );
    expect(screen.getAllByRole('article')).toHaveLength(1);
    rerender(<BlogEditorialRow entries={[]} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});

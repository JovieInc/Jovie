import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BlogPost, BlogPostSummary } from '@/lib/blog/getBlogPosts';
import type { ResolvedAuthor } from '@/lib/blog/resolveAuthor';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const onShare = vi.fn();

vi.mock('@/components/features/share/PublicShareMenu', () => ({
  PublicShareMenu: ({ title }: { readonly title: string }) => (
    <button type='button' onClick={onShare}>
      {title}
    </button>
  ),
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
  profileUrl: '/jovie',
};

const related: BlogPostSummary[] = [
  {
    slug: 'the-friday-problem',
    title: 'The Friday Problem',
    date: '2025-01-15',
    author: 'Jovie',
    tags: [],
    excerpt: 'Most artists make the same mistake.',
    readingTime: 4,
    wordCount: 922,
  },
];

function renderPost(
  overrides: Partial<Parameters<typeof BlogPostPage>[0]> = {}
) {
  return render(
    <BlogPostPage
      post={post}
      author={author}
      toc={post.toc}
      relatedPosts={[]}
      relatedAuthors={new Map()}
      {...overrides}
    />
  );
}

describe('BlogPostPage certificate', () => {
  it('renders the post header and body axe-clean', async () => {
    const { container } = renderPost();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Release rhythm' })
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Blog' })).toHaveAttribute(
      'href',
      '/blog'
    );
    expect(container.querySelector('time')).toHaveAttribute(
      'datetime',
      '2026-01-15'
    );
    await expectNoA11yViolations(container);
  });

  it('opens the share menu and links the author profile', async () => {
    const user = userEvent.setup();
    renderPost();

    await user.click(screen.getByRole('button', { name: 'Share' }));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('link', { name: 'Jovie' })[0]).toHaveAttribute(
      'href',
      '/jovie'
    );
  });

  it('renders a post with no headings and no related posts axe-clean', async () => {
    const { container } = renderPost({
      post: { ...post, html: '<p>One short paragraph.</p>', toc: [] },
      toc: [],
    });

    expect(screen.getByText('One short paragraph.')).toBeVisible();
    expect(screen.queryByText('The Friday Problem')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders related posts and right-to-left copy axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        <BlogPostPage
          post={{ ...post, title: 'إيقاع الإصدار' }}
          author={author}
          toc={post.toc}
          relatedPosts={related}
          relatedAuthors={new Map([['the-friday-problem', author]])}
        />
      </div>
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'إيقاع الإصدار' })
    ).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Related Posts' })
    ).toHaveTextContent('The Friday Problem');
    await expectNoA11yViolations(container);
  });
});

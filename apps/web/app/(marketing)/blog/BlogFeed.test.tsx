import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BlogFeedEntry } from './BlogFeed';
import { BlogFeed } from './BlogFeed';

const entries: readonly BlogFeedEntry[] = [
  {
    post: {
      slug: 'first-post',
      title: 'First Post',
      date: '2026-01-15',
      author: 'Jovie',
      category: 'Product',
      tags: [],
      excerpt: 'The first deterministic blog fixture.',
      readingTime: 2,
      wordCount: 476,
    },
    author: {
      name: 'Jovie',
      avatarUrl: null,
      isVerified: false,
    },
  },
  {
    post: {
      slug: 'second-post',
      title: 'Second Post',
      date: '2026-01-10',
      author: 'Jovie',
      category: 'Playbooks',
      tags: [],
      excerpt: 'The second deterministic blog fixture.',
      readingTime: 3,
      wordCount: 714,
    },
    author: {
      name: 'Jovie',
      avatarUrl: null,
      isVerified: false,
    },
  },
];

describe('BlogFeed', () => {
  it('renders the first entry as featured and the remainder in the feed', () => {
    const { container } = render(<BlogFeed entries={entries} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Blog' })
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'First Post' })
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Second Post' })
    ).toBeVisible();
    expect(container.querySelectorAll('article')).toHaveLength(2);
    expect(container.querySelector('article')?.className).toContain('p-8');
  });

  it('renders the production empty state without inventing posts', () => {
    render(<BlogFeed entries={[]} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Blog' })
    ).toBeVisible();
    expect(screen.getByText('Posts coming soon.')).toBeVisible();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('is shared by the route and deterministic Pen story', () => {
    const pageSource = readFileSync(
      resolve(process.cwd(), 'app/(marketing)/blog/page.tsx'),
      'utf8'
    );
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/storybook/BlogFeed.stories.tsx'
      ),
      'utf8'
    );

    expect(pageSource).toContain("import { BlogFeed } from './BlogFeed'");
    expect(pageSource).toContain('<BlogFeed entries={entries} />');
    expect(storySource).toContain("from '@/app/(marketing)/blog/BlogFeed'");
    expect(storySource).toContain('component: BlogFeed');
    expect(storySource).toContain('pen: {');
    expect(storySource).toContain("registryId: 'web-025-blog'");
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BlogFeedEntry } from './BlogFeed';
import { BlogFeed } from './BlogFeed';

const readWebSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

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
    const pageSource = readWebSource('app/(marketing)/blog/page.tsx');
    const storySource = readWebSource(
      'components/marketing/storybook/BlogFeed.stories.tsx'
    );

    expect(pageSource).toContain("import { BlogFeed } from './BlogFeed'");
    expect(pageSource).toContain('<BlogFeed entries={entries} />');
    expect(storySource).toContain("from '@/app/(marketing)/blog/BlogFeed'");
    expect(storySource).toContain('component: BlogFeed');
    expect(storySource).toContain("title: 'Marketing/Routes/BlogIndex'");
    expect(storySource).toContain('export const Default');
    expect(storySource).toContain('pen: {');
    expect(storySource).toContain("registryId: 'web-025-blog'");
    expect(storySource).not.toContain('StoryBlogCard');
  });

  it('keeps the canonical story presentation graph browser-safe', () => {
    const presentationSources = [
      'app/(marketing)/blog/BlogFeed.tsx',
      'app/(marketing)/blog/components/BlogAuthorCard.tsx',
      'app/(marketing)/blog/components/BlogCard.tsx',
      'app/(marketing)/blog/components/CategoryPill.tsx',
      'components/marketing/storybook/BlogFeed.stories.tsx',
      'components/organisms/BlogAuthorPage.stories.tsx',
      'components/organisms/BlogCategoryContent.stories.tsx',
      'lib/blog/categories.ts',
      'lib/blog/presentation-contracts.ts',
    ].map(readWebSource);
    const presentationGraph = presentationSources.join('\n');
    const serverPostSource = readWebSource('lib/blog/getBlogPosts.ts');
    const serverAuthorSource = readWebSource('lib/blog/resolveAuthor.ts');

    expect(presentationGraph).toContain('@/lib/blog/presentation-contracts');
    expect(presentationGraph).not.toMatch(
      /(?:node:(?:fs|path|url)|filesystem-paths|(?:\/|')getBlogPosts)/
    );
    expect(readWebSource('lib/blog/presentation-contracts.ts')).not.toMatch(
      /(?:^|\n)\s*import\s/
    );
    expect(serverPostSource).toContain(
      "export type {\n  BlogPostMetadata,\n  BlogPostSummary,\n} from './presentation-contracts'"
    );
    expect(serverAuthorSource).toContain(
      "export type { ResolvedAuthor } from './presentation-contracts'"
    );
  });
});

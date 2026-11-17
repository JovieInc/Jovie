import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BlogCard } from '@/app/(marketing)/blog/components/BlogCard';
import type { ResolvedAuthor } from '@/lib/blog/presentation-contracts';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BlogCategoryContent } from './BlogCategoryContent';
import {
  BLOG_CATEGORY_STORY_CATEGORY,
  BLOG_CATEGORY_STORY_POST,
} from './BlogCategoryContent.stories';

const author = {
  name: BLOG_CATEGORY_STORY_POST.author,
  avatarUrl: null,
  isVerified: false,
} satisfies ResolvedAuthor;

describe('BlogCategoryContent certificate', () => {
  it('renders the category with its post axe-clean', async () => {
    const { container } = render(
      <BlogCategoryContent category={BLOG_CATEGORY_STORY_CATEGORY} hasPosts>
        <BlogCard post={BLOG_CATEGORY_STORY_POST} author={author} />
      </BlogCategoryContent>
    );

    const feed = screen.getByRole('region', {
      name: `${BLOG_CATEGORY_STORY_CATEGORY.name} posts`,
    });
    expect(within(feed).getAllByRole('article')).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('renders the empty category axe-clean', async () => {
    const { container } = render(
      <BlogCategoryContent
        category={BLOG_CATEGORY_STORY_CATEGORY}
        hasPosts={false}
      />
    );

    expect(screen.getByText('No posts in this category yet.')).toBeVisible();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders long category copy axe-clean', async () => {
    const name = 'Artist Management, Touring Logistics and Booking Agents';
    const { container } = render(
      <BlogCategoryContent
        category={{
          ...BLOG_CATEGORY_STORY_CATEGORY,
          name,
          description: 'A long description. '.repeat(12).trim(),
        }}
        hasPosts={false}
      />
    );

    expect(screen.getByRole('heading', { level: 1, name })).toBeVisible();
    expect(screen.getByRole('region', { name: `${name} posts` })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <BlogCategoryContent category={BLOG_CATEGORY_STORY_CATEGORY} hasPosts>
          <BlogCard post={BLOG_CATEGORY_STORY_POST} author={author} />
        </BlogCategoryContent>
      </div>
    );

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: BLOG_CATEGORY_STORY_CATEGORY.name,
      })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});

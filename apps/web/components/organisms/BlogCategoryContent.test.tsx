import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BlogCard } from '@/app/(marketing)/blog/components/BlogCard';
import { getBlogPosts } from '@/lib/blog/getBlogPosts';
import type { ResolvedAuthor } from '@/lib/blog/presentation-contracts';
import { BlogCategoryContent } from './BlogCategoryContent';
import blogCategoryMeta, {
  BLOG_CATEGORY_STORY_CATEGORY,
  BLOG_CATEGORY_STORY_POST,
  BLOG_CATEGORY_STORY_RECEIPT,
} from './BlogCategoryContent.stories';

const storyAuthor = {
  name: BLOG_CATEGORY_STORY_POST.author,
  avatarUrl: null,
  isVerified: false,
} satisfies ResolvedAuthor;

describe('BlogCategoryContent', () => {
  it('renders the shipped category shell around the deterministic post', () => {
    const { container } = render(
      <BlogCategoryContent
        category={BLOG_CATEGORY_STORY_CATEGORY}
        hasPosts={true}
      >
        <BlogCard post={BLOG_CATEGORY_STORY_POST} author={storyAuthor} />
      </BlogCategoryContent>
    );

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: BLOG_CATEGORY_STORY_CATEGORY.name,
      })
    ).toBeVisible();
    expect(
      screen.getByText(BLOG_CATEGORY_STORY_CATEGORY.description)
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'The Contact Problem' })
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: /The Contact Problem/ })
    ).toHaveAttribute('href', '/blog/the-contact-problem');
    expect(container.querySelectorAll('article')).toHaveLength(1);
  });

  it('renders the existing empty state without inventing posts', () => {
    render(
      <BlogCategoryContent
        category={BLOG_CATEGORY_STORY_CATEGORY}
        hasPosts={false}
      />
    );

    expect(screen.getByText('No posts in this category yet.')).toBeVisible();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('keeps the deterministic story fields aligned with checked-in content', async () => {
    const posts = await getBlogPosts();
    const sourcePost = posts.find(post => post.slug === 'the-contact-problem');

    expect(sourcePost).toBeDefined();
    expect(BLOG_CATEGORY_STORY_POST).toEqual({
      slug: sourcePost?.slug,
      title: sourcePost?.title,
      date: sourcePost?.date,
      author: sourcePost?.author,
      category: sourcePost?.category,
      excerpt: sourcePost?.excerpt,
      readingTime: sourcePost?.readingTime,
      wordCount: sourcePost?.wordCount,
      tags: sourcePost?.tags,
    });
  });

  it('is shared while params, metadata, notFound, data, schema, and cards stay route-owned', () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), 'app/(marketing)/blog/category/[slug]/page.tsx'),
      'utf8'
    );
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/organisms/BlogCategoryContent.stories.tsx'
      ),
      'utf8'
    );

    expect(routeSource).toContain('generateStaticParams');
    expect(routeSource).toContain('generateMetadata');
    expect(routeSource).toContain('notFound()');
    expect(routeSource).toContain('getProfilesByUsernames(usernames)');
    expect(routeSource).toContain('buildBreadcrumbSchema');
    expect(routeSource).toContain('<BlogCategoryContent');
    expect(routeSource).toContain('<BlogCard key={post.slug}');
    expect(routeSource).not.toContain('marketing-kicker mb-0');
    expect(storySource).toContain('component: BlogCategoryContent');
    expect(storySource).toContain(
      "from '@/app/(marketing)/blog/components/BlogCard'"
    );
    expect(storySource).toContain('<BlogCard');
    expect(storySource).not.toContain('StoryBlogCard');
    expect(storySource).toContain('excludeStories: /^BLOG_CATEGORY_STORY_/');
    expect(storySource).toContain(
      "registryId: 'web-024-blog--category--[slug]'"
    );
    expect(storySource).toContain(
      "fixture: 'content/blog/the-contact-problem.md'"
    );
  });

  it('excludes fixture exports without hiding the intended stories', () => {
    const excludeStories = blogCategoryMeta.excludeStories;

    expect(excludeStories).toEqual(/^BLOG_CATEGORY_STORY_/);
    expect(excludeStories.test('BLOG_CATEGORY_STORY_CATEGORY')).toBe(true);
    expect(excludeStories.test('BLOG_CATEGORY_STORY_POST')).toBe(true);
    expect(excludeStories.test('BLOG_CATEGORY_STORY_RECEIPT')).toBe(true);
    expect(excludeStories.test('Web024ArtistManagement')).toBe(false);
    expect(excludeStories.test('Empty')).toBe(false);
  });

  it('keeps the Pen receipt on the commit that introduced the shared body', () => {
    expect(BLOG_CATEGORY_STORY_RECEIPT).toEqual({
      registryId: 'web-024-blog--category--[slug]',
      route: '/blog/category/artist-management',
      source: 'apps/web/components/organisms/BlogCategoryContent.tsx',
      sourceExport: 'BlogCategoryContent',
      storyExport: 'Web024ArtistManagement',
      sourceSha: '916d0bddd91c065aa01b387adc2acd189391b040',
      fixture: 'content/blog/the-contact-problem.md',
    });
    expect(BLOG_CATEGORY_STORY_RECEIPT.sourceSha).not.toBe(
      '0892cccf39d72c62890ad4bc797cfd6f2d651af6'
    );
  });
});

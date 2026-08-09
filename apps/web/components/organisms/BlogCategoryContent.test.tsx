import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getBlogPosts } from '@/lib/blog/getBlogPosts';
import { StoryBlogCard } from '../marketing/storybook/StoryBlogCard';
import { BlogCategoryContent } from './BlogCategoryContent';
import {
  BLOG_CATEGORY_STORY_CATEGORY,
  BLOG_CATEGORY_STORY_POST,
} from './BlogCategoryContent.stories';

describe('BlogCategoryContent', () => {
  it('renders the shipped category shell around the deterministic post', () => {
    const { container } = render(
      <BlogCategoryContent
        category={BLOG_CATEGORY_STORY_CATEGORY}
        hasPosts={true}
      >
        <StoryBlogCard post={BLOG_CATEGORY_STORY_POST} />
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
      "registryId: 'web-024-blog--category--[slug]'"
    );
    expect(storySource).toContain(
      "fixture: 'content/blog/the-contact-problem.md'"
    );
  });
});

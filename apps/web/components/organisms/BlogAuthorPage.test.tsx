import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { BlogAuthorPage } from './BlogAuthorPage';
import { BLOG_AUTHOR_STORY_RECEIPT } from './BlogAuthorPage.stories';

const readWebSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

const routeSource = readWebSource(
  'app/(marketing)/blog/authors/[username]/page.tsx'
);
const storySource = readWebSource(
  'components/organisms/BlogAuthorPage.stories.tsx'
);
const storybookMainSource = readWebSource('.storybook/main.ts');

describe('BlogAuthorPage', () => {
  it('preserves the shipped author layout and article count grammar', () => {
    const { rerender } = render(
      <BlogAuthorPage
        articleCount={1}
        authorHero={<h1>{TIM_WHITE_PROFILE.name}</h1>}
        articleCards={<article>The Contact Problem</article>}
      />
    );

    expect(screen.getByTestId('blog-author-page')).toHaveClass('min-h-screen');
    expect(
      screen.getByRole('heading', { level: 1, name: TIM_WHITE_PROFILE.name })
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      '1 article'
    );
    expect(screen.getByText('The Contact Problem')).toBeVisible();

    rerender(
      <BlogAuthorPage
        articleCount={4}
        authorHero={<h1>{TIM_WHITE_PROFILE.name}</h1>}
        articleCards={<article>The Friday Problem</article>}
      />
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      '4 articles'
    );
  });

  it('keeps params, loaders, metadata, schemas, and notFound in the route', () => {
    expect(routeSource).toContain('params: Promise<{ username: string }>');
    expect(routeSource).toContain('generateStaticParams');
    expect(routeSource).toContain('generateMetadata');
    expect(routeSource).toContain('getBlogPosts()');
    expect(routeSource).toContain('getProfileByUsername(username)');
    expect(routeSource).toContain('notFound()');
    expect(routeSource).toContain('buildPersonSchema');
    expect(routeSource).toContain('buildBreadcrumbSchema');
    expect(routeSource).toContain(
      "from '@/components/organisms/BlogAuthorPage'"
    );
    expect(routeSource).toContain('<BlogAuthorPage');
    expect(routeSource).toContain("variant='hero'");
    expect(routeSource).toContain('<BlogCard');
  });

  it('binds the discovered story to the exact source and checked-in identity', () => {
    expect(storybookMainSource).toContain(
      "'../components/**/*.stories.@(js|jsx|ts|tsx|mdx)'"
    );
    expect(storySource).toContain('component: BlogAuthorPage');
    expect(storySource).toContain(
      "registryId: 'web-023-blog--authors--[username]'"
    );
    expect(storySource).toContain("route: '/blog/authors/[username]'");
    expect(storySource).toContain(
      "'apps/web/app/(marketing)/blog/authors/[username]/page.tsx'"
    );
    expect(storySource).toContain('TIM_WHITE_PROFILE');
    expect(storySource).toContain("slug: 'the-contact-problem'");
    expect(storySource).toContain("slug: 'the-friday-problem'");
    expect(storySource).toContain("slug: 'the-myspace-problem'");
    expect(storySource).toContain("slug: 'the-suno-playbook-teardown'");
    expect(storySource).not.toMatch(/images\.unsplash\.com\/placeholder/i);
  });

  it('keeps the Pen receipt on the shared-body introducing commit', () => {
    expect(BLOG_AUTHOR_STORY_RECEIPT).toEqual({
      registryId: 'web-023-blog--authors--[username]',
      route: '/blog/authors/[username]',
      sourcePath: 'apps/web/app/(marketing)/blog/authors/[username]/page.tsx',
      bodyPath: 'apps/web/components/organisms/BlogAuthorPage.tsx',
      sourceExport: 'BlogAuthorPage',
      storyExport: 'Web023BlogAuthor',
      sourceSha: '468cc374b544d64573403e5fa8e047303964e877',
    });
    expect(BLOG_AUTHOR_STORY_RECEIPT.sourceSha).not.toBe(
      '0892cccf39d72c62890ad4bc797cfd6f2d651af6'
    );
  });
});

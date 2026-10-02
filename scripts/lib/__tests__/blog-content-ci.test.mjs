import { describe, expect, it } from 'vitest';
import {
  BLOG_AFFECTED_OUTPUTS,
  BLOG_CONTENT_CHECKS,
  classifyBlogContentChanges,
  parseNameStatusZ,
} from '../blog-content-ci.mjs';

const change = (path, status = 'M', oldPath) => ({
  status,
  path,
  ...(oldPath ? { oldPath } : {}),
});

describe('blog content CI classifier', () => {
  it('positively selects plain Markdown and its frontmatter metadata', () => {
    const receipt = classifyBlogContentChanges([
      change('apps/web/content/blog/a-safe-article.md'),
    ]);

    expect(receipt).toMatchObject({
      contentOnly: true,
      profile: 'content-only',
      changedPostSlugs: ['a-safe-article'],
      removedPostSlugs: [],
      selectedChecks: BLOG_CONTENT_CHECKS,
      affectedOutputs: BLOG_AFFECTED_OUTPUTS,
    });
  });

  it('selects approved non-executable raster assets without requiring prose', () => {
    const receipt = classifyBlogContentChanges([
      change('apps/web/public/images/blog/article/cover.avif', 'A'),
      change('apps/web/public/images/blog/article-card.webp'),
    ]);

    expect(receipt.contentOnly).toBe(true);
    expect(receipt.changedPostSlugs).toEqual([]);
    expect(receipt.changedAssets).toEqual([
      'apps/web/public/images/blog/article-card.webp',
      'apps/web/public/images/blog/article/cover.avif',
    ]);
  });

  it('keeps deletion on the content path so discovery outputs are recertified', () => {
    const receipt = classifyBlogContentChanges([
      change('apps/web/content/blog/withdrawn-article.md', 'D'),
    ]);

    expect(receipt.contentOnly).toBe(true);
    expect(receipt.changedPostSlugs).toEqual([]);
    expect(receipt.removedPostSlugs).toEqual(['withdrawn-article']);
  });

  it.each([
    [
      'content plus workflow',
      [
        change('apps/web/content/blog/post.md'),
        change('.github/workflows/ci.yml'),
      ],
      'unapproved-path',
    ],
    [
      'content plus renderer',
      [
        change('apps/web/content/blog/post.md'),
        change('apps/web/lib/blog/getBlogPosts.ts'),
      ],
      'unapproved-path',
    ],
    [
      'dependency or lockfile',
      [change('apps/web/content/blog/post.md'), change('pnpm-lock.yaml')],
      'unapproved-path',
    ],
    [
      'executable MDX',
      [change('apps/web/content/blog/post.mdx')],
      'executable-markdown',
    ],
    [
      'uppercase executable MDX',
      [change('apps/web/content/blog/post.MDX')],
      'executable-markdown',
    ],
    [
      'unsafe SVG asset',
      [change('apps/web/public/images/blog/post.svg')],
      'unsafe-blog-asset',
    ],
    ['unmapped file', [change('unknown/blog/post.md')], 'unapproved-markdown'],
    [
      'classifier control',
      [
        change('apps/web/content/blog/post.md'),
        change('scripts/lib/blog-content-ci.mjs'),
      ],
      'unapproved-path',
    ],
  ])('escalates deliberate-red fixture: %s', (_name, changes, reason) => {
    const receipt = classifyBlogContentChanges(changes);

    expect(receipt.contentOnly).toBe(false);
    expect(receipt.profile).toBe('full');
    expect(receipt.selectedChecks).toEqual([
      'applicable-broader-qualification',
    ]);
    expect(receipt.rejections.map(item => item.reason)).toContain(reason);
  });

  it('escalates renames even when both paths otherwise look approved', () => {
    const receipt = classifyBlogContentChanges([
      change(
        'apps/web/content/blog/new-slug.md',
        'R100',
        'apps/web/content/blog/old-slug.md'
      ),
    ]);

    expect(receipt.contentOnly).toBe(false);
    expect(receipt.rejections).toContainEqual(
      expect.objectContaining({
        reason: 'renamed-path',
        oldPath: 'apps/web/content/blog/old-slug.md',
        path: 'apps/web/content/blog/new-slug.md',
      })
    );
  });

  it('fails closed when certification prerequisites are not proven', () => {
    const receipt = classifyBlogContentChanges(
      [change('apps/web/content/blog/post.md')],
      { prerequisitesAvailable: false }
    );

    expect(receipt.contentOnly).toBe(false);
    expect(receipt.rejections.map(item => item.reason)).toContain(
      'certification-prerequisites-unavailable'
    );
  });

  it('fails closed on an empty or unsupported diff', () => {
    expect(
      classifyBlogContentChanges([]).rejections.map(item => item.reason)
    ).toContain('empty-diff');
    expect(
      classifyBlogContentChanges([
        change('apps/web/content/blog/post.md', 'U'),
      ]).rejections.map(item => item.reason)
    ).toContain('unsupported-status');
  });
});

describe('git name-status parser', () => {
  it('preserves rename and copy evidence instead of flattening to paths', () => {
    const changes = parseNameStatusZ(
      Buffer.from(
        'M\0apps/web/content/blog/post.md\0R100\0apps/web/content/blog/old.md\0apps/web/content/blog/new.md\0C090\0apps/web/content/blog/source.md\0apps/web/content/blog/copy.md\0'
      )
    );

    expect(changes).toEqual([
      { status: 'M', path: 'apps/web/content/blog/post.md' },
      {
        status: 'R100',
        oldPath: 'apps/web/content/blog/old.md',
        path: 'apps/web/content/blog/new.md',
      },
      {
        status: 'C090',
        oldPath: 'apps/web/content/blog/source.md',
        path: 'apps/web/content/blog/copy.md',
      },
    ]);
  });

  it('rejects truncated status records', () => {
    expect(() => parseNameStatusZ(Buffer.from('R100\0old.md\0'))).toThrow(
      'changed-file R record is incomplete'
    );
  });
});

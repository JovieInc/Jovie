import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getPublicBlogCandidate,
  loadBlogCatalog,
} from '@/lib/blog/getBlogPosts';
import { parseBlogSource } from '@/lib/blog/metadata';
import type { BlogPublicationRecord } from '@/lib/blog/publication';
import { createMarkdownDocument } from '@/lib/docs/getMarkdownDocument';
import { resolveAppContentPath, resolveAppPath } from '@/lib/filesystem-paths';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(root => rm(root, { recursive: true }))
  );
});

function markdown(
  slug: string,
  overrides: Partial<Record<string, string>> = {},
  body = '# Test article\n\nA safe article body.'
): string {
  const fields: Record<string, string> = {
    id: slug,
    slug,
    title: 'A Valid Test Article',
    description:
      'A source-backed description long enough for the publication contract.',
    date: '2026-10-01T12:00:00Z',
    author: 'Tim White',
    authorUsername: 'tim',
    authorTitle: 'Founder at Jovie',
    authorProfile: '/tim',
    category: 'Product',
    tags: 'publishing, markdown',
    ...overrides,
  };

  return `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}\n---\n\n${body}\n`;
}

function record(
  slug: string,
  state: BlogPublicationRecord['state'] = 'indexed'
): BlogPublicationRecord {
  return { id: slug, slug, state };
}

async function fixtureCatalog(
  files: Readonly<Record<string, string>>,
  publicationRecords: readonly BlogPublicationRecord[],
  now = new Date('2026-10-01T12:00:00Z')
) {
  const root = await mkdtemp(join(tmpdir(), 'jovie-blog-publication-'));
  temporaryRoots.push(root);
  const directory = join(root, 'content');
  const publicDirectory = join(root, 'public');
  await Promise.all([mkdir(directory), mkdir(publicDirectory)]);
  await Promise.all(
    Object.entries(files).map(([filename, source]) =>
      writeFile(join(directory, filename), source, 'utf8')
    )
  );

  return loadBlogCatalog({
    directory,
    publicDirectory,
    publicationRecords,
    now,
  });
}

describe('blog metadata contract', () => {
  it('parses every supported scalar and comma-separated tag type', () => {
    const parsed = parseBlogSource(
      markdown('typed-contract', {
        updatedDate: '2026-10-02',
        image: '/images/blog/typed-contract.svg',
        imageAlt: 'Abstract artwork for the typed contract article.',
      }),
      {
        fileSlug: 'typed-contract',
        sourcePath: 'content/blog/typed-contract.md',
      }
    );

    expect(parsed.metadata).toMatchObject({
      id: 'typed-contract',
      slug: 'typed-contract',
      updatedDate: '2026-10-02',
      tags: ['publishing', 'markdown'],
      image: '/images/blog/typed-contract.svg',
      imageAlt: 'Abstract artwork for the typed contract article.',
    });
  });

  it('deliberate red: rejects a missing explicit publication date', () => {
    const sourceWithoutDate = markdown('missing-date').replace(
      /^date:.*\n/m,
      ''
    );
    expect(() =>
      parseBlogSource(sourceWithoutDate, {
        fileSlug: 'missing-date',
        sourcePath: 'content/blog/missing-date.md',
      })
    ).toThrow(/missing-date\.md.*date/is);
  });

  it.each([
    ['empty date', { date: '' }, /date.*required/i],
    ['invalid date', { date: 'October 1, 2026' }, /date.*ISO/i],
    [
      'unsafe author URL',
      { authorProfile: 'javascript:alert(1)' },
      /authorProfile/i,
    ],
    [
      'asset traversal',
      { image: '/images/blog/../../private.png', imageAlt: 'Private file' },
      /image/i,
    ],
    ['missing asset alt', { image: '/images/blog/article.svg' }, /imageAlt/i],
    ['forged certification', { certified: 'true' }, /certified/i],
    ['forged publication', { publication: 'indexed' }, /publication/i],
  ])(
    'deliberate red: rejects %s with a file-level error',
    (_, patch, error) => {
      expect(() =>
        parseBlogSource(markdown('invalid-article', patch), {
          fileSlug: 'invalid-article',
          sourcePath: 'content/blog/invalid-article.md',
        })
      ).toThrow(error);
    }
  );

  it('deliberate red: rejects malformed and duplicate frontmatter lines', () => {
    const malformed = markdown('malformed').replace(
      'title: A Valid Test Article',
      'title A Valid Test Article'
    );
    expect(() =>
      parseBlogSource(malformed, {
        fileSlug: 'malformed',
        sourcePath: 'content/blog/malformed.md',
      })
    ).toThrow(/content\/blog\/malformed\.md.*line 4/is);

    const duplicate = markdown('duplicate').replace(
      'description:',
      'title: Another title\ndescription:'
    );
    expect(() =>
      parseBlogSource(duplicate, {
        fileSlug: 'duplicate',
        sourcePath: 'content/blog/duplicate.md',
      })
    ).toThrow(/duplicate field title/i);
  });

  it('preserves the shared unsafe-Markdown sanitization boundary', async () => {
    const rendered = await createMarkdownDocument(
      '[unsafe](javascript:alert(1)) <script>alert(2)</script>'
    );
    expect(rendered.html).not.toMatch(/javascript:|<script/i);
  });
});

describe('shared blog publication policy', () => {
  it('keeps every migrated public post visible with stable ordering', async () => {
    const catalog = await loadBlogCatalog({
      directory: resolveAppContentPath('blog'),
      publicDirectory: resolveAppPath('public'),
      now: new Date('2026-10-01T12:00:00Z'),
    });

    expect(catalog.publicPosts.map(post => post.slug)).toEqual([
      'the-suno-playbook-teardown',
      'the-contact-problem',
      'the-myspace-problem',
      'the-friday-problem',
    ]);
    expect(catalog.publicPosts.map(post => post.date)).toEqual([
      '2026-07-04',
      '2026-03-18',
      '2025-02-03',
      '2025-01-15',
    ]);
    expect(catalog.indexablePosts).toEqual(catalog.publicPosts);
    expect(catalog.publicPosts.every(post => post.image && post.imageAlt)).toBe(
      true
    );
  });

  it('freezes before, at, and after publication boundaries', async () => {
    const files = {
      'scheduled.md': markdown('scheduled', {
        date: '2026-10-02T09:30:00Z',
      }),
    };
    const before = await fixtureCatalog(
      files,
      [record('scheduled', 'embargoed')],
      new Date('2026-10-02T09:29:59.999Z')
    );
    const at = await fixtureCatalog(
      files,
      [record('scheduled')],
      new Date('2026-10-02T09:30:00.000Z')
    );
    const after = await fixtureCatalog(
      files,
      [record('scheduled')],
      new Date('2026-10-02T09:30:00.001Z')
    );

    expect(before.publicPosts).toEqual([]);
    expect(at.publicPosts.map(post => post.slug)).toEqual(['scheduled']);
    expect(after.publicPosts.map(post => post.slug)).toEqual(['scheduled']);
  });

  it('keeps draft, embargoed, shadow, and withdrawn posts unavailable directly', async () => {
    const states = ['draft', 'embargoed', 'shadow', 'withdrawn'] as const;
    const files = Object.fromEntries(
      states.map(state => [`${state}.md`, markdown(state)])
    );
    const catalog = await fixtureCatalog(
      files,
      states.map(state => record(state, state))
    );

    expect(catalog.publicPosts).toEqual([]);
    for (const state of states) {
      expect(() => getPublicBlogCandidate(catalog, state)).toThrow(
        /blog post unavailable/i
      );
    }
  });

  it('keeps public noindex separate from publication eligibility', async () => {
    const files = {
      'indexed.md': markdown('indexed'),
      'noindex.md': markdown('noindex'),
    };
    const catalog = await fixtureCatalog(files, [
      record('indexed', 'indexed'),
      record('noindex', 'noindex'),
    ]);

    expect(catalog.publicPosts.map(post => post.slug)).toEqual([
      'indexed',
      'noindex',
    ]);
    expect(catalog.indexablePosts.map(post => post.slug)).toEqual(['indexed']);
    expect(getPublicBlogCandidate(catalog, 'noindex').metadata.slug).toBe(
      'noindex'
    );
  });

  it('deliberate red: prevents direct, listing, path, and sitemap disagreement', async () => {
    const files = {
      'public.md': markdown('public'),
      'future.md': markdown('future', { date: '2026-10-02' }),
      'draft.md': markdown('draft'),
    };
    const catalog = await fixtureCatalog(files, [
      record('public'),
      record('future', 'embargoed'),
      record('draft', 'draft'),
    ]);

    const listingSlugs = catalog.publicPosts.map(post => post.slug);
    const generatedPathSlugs = catalog.publicCandidates.map(
      candidate => candidate.metadata.slug
    );
    const sitemapSlugs = catalog.indexablePosts.map(post => post.slug);

    expect(listingSlugs).toEqual(['public']);
    expect(generatedPathSlugs).toEqual(listingSlugs);
    expect(sitemapSlugs).toEqual(listingSlugs);
    expect(getPublicBlogCandidate(catalog, 'public').metadata.slug).toBe(
      'public'
    );
    expect(() => getPublicBlogCandidate(catalog, 'future')).toThrow();
    expect(() => getPublicBlogCandidate(catalog, 'draft')).toThrow();
    expect(() => getPublicBlogCandidate(catalog, '../private')).toThrow();
  });

  it('deliberate red: rejects a future article promoted before its deploy boundary', async () => {
    await expect(
      fixtureCatalog(
        {
          'future.md': markdown('future', {
            date: '2026-10-02T09:30:00Z',
          }),
        },
        [record('future')],
        new Date('2026-10-02T09:29:59Z')
      )
    ).rejects.toThrow(/future-dated.*keep it embargoed or shadow/i);
  });

  it('deliberate red: rejects duplicate IDs and canonical slugs', async () => {
    await expect(
      fixtureCatalog(
        {
          'one.md': markdown('one', { id: 'duplicate-id' }),
          'two.md': markdown('two', { id: 'duplicate-id' }),
        },
        [
          { id: 'duplicate-id', slug: 'one', state: 'indexed' },
          { id: 'duplicate-id', slug: 'two', state: 'indexed' },
        ]
      )
    ).rejects.toThrow(/duplicate (blog )?(id|slug)/i);

    await expect(
      fixtureCatalog(
        {
          'one.md': markdown('one', { slug: 'shared-slug' }),
        },
        [record('one')]
      )
    ).rejects.toThrow(/slug must match filename/i);
  });

  it('deliberate red: rejects missing publication and asset references', async () => {
    await expect(
      fixtureCatalog({ 'unregistered.md': markdown('unregistered') }, [])
    ).rejects.toThrow(/unregistered\.md.*publication record/is);

    await expect(
      fixtureCatalog(
        {
          'missing-asset.md': markdown('missing-asset', {
            image: '/images/blog/missing.svg',
            imageAlt: 'Missing test artwork.',
          }),
        },
        [record('missing-asset')]
      )
    ).rejects.toThrow(/missing-asset\.md.*asset.*does not exist/is);
  });

  it('fails loudly on one bad candidate instead of returning an empty feed', async () => {
    await expect(
      fixtureCatalog(
        {
          'published.md': markdown('published'),
          'bad.md': markdown('bad', { date: 'not-a-date' }),
        },
        [record('published'), record('bad')]
      )
    ).rejects.toThrow(/bad\.md.*date/is);
  });
});

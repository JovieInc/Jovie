import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BlogSourceMetadataSchema } from '@/lib/blog/metadata';
import { parseMarkdownFrontmatter } from '@/lib/docs/parseMarkdownFrontmatter';
import { resolveAppContentPath } from '@/lib/filesystem-paths';

const SLUG = 'the-suno-playbook-teardown';
const raw = readFileSync(
  join(resolveAppContentPath('blog'), `${SLUG}.md`),
  'utf-8'
);
const { content, data } = parseMarkdownFrontmatter(raw);

describe('blog post: the-suno-playbook-teardown', () => {
  it('preserves the canonical post identity and founder byline', () => {
    expect(BlogSourceMetadataSchema.parse(data)).toMatchObject({
      id: SLUG,
      slug: SLUG,
      date: '2026-07-04',
      author: 'Tim White',
      authorUsername: 'tim',
      authorTitle: 'Founder at Jovie',
      authorProfile: '/tim',
      image: '/images/blog/suno-playbook.svg',
    });
  });

  it('leaves the page title to the renderer and links to primary platform guidance', () => {
    expect(content).not.toMatch(/^#\s+\S/m);
    expect(content).toContain('](https://help.suno.com/en/articles/2410177)');
    expect(content).toContain('](https://help.suno.com/en/articles/9601665)');
    expect(content).toContain(
      '](https://artists.spotify.com/artificial-streaming)'
    );
  });
});

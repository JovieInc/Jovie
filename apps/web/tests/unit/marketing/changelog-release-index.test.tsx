import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReleaseNotesIndex } from '@/app/(marketing)/changelog/ReleaseNotesIndex';
import { parseChangelogDocument } from '@/lib/changelog-parser';
import { auditOrphans, internalLinkPaths } from '@/lib/seo/geo-certification';

const ORIGIN = 'https://jov.ie';

describe('server-rendered release notes index', () => {
  it('keeps older release routes crawlable as new months arrive', () => {
    const releases = [
      { version: '2026-10-02', date: '2026-10-02' },
      { version: '26.9.1', date: '2026-09-01' },
      { version: '26.8.1', date: '2026-08-16' },
    ];
    const html = renderToStaticMarkup(
      <ReleaseNotesIndex releases={releases} />
    );
    expect(internalLinkPaths(html, ORIGIN)).toContain('/changelog/26.8.1');
    const result = auditOrphans(
      [
        { pathname: '/changelog', html, inSitemap: true },
        { pathname: '/changelog/26.8.1', html: '', inSitemap: true },
      ],
      ORIGIN
    );
    expect(result.get('/changelog/26.8.1')?.status).toBe('passed');
    expect(html).toContain('<summary');
    expect(html).toContain('Release Notes By Date');
  });

  it('links every current public release, independently of outcome pagination', () => {
    const source = readFileSync(
      resolve(process.cwd(), '../../CHANGELOG.md'),
      'utf8'
    );
    const { releases, unpublishedReleases } = parseChangelogDocument(source);
    const html = renderToStaticMarkup(
      <ReleaseNotesIndex releases={releases} />
    );
    const links = internalLinkPaths(html, ORIGIN);
    for (const release of releases) {
      expect(links).toContain(
        `/changelog/${encodeURIComponent(release.version)}`
      );
    }
    for (const release of unpublishedReleases) {
      expect(links).not.toContain(
        `/changelog/${encodeURIComponent(release.version)}`
      );
    }
  });

  it('renders no disclosure for an empty public archive', () => {
    expect(renderToStaticMarkup(<ReleaseNotesIndex releases={[]} />)).toBe('');
  });
});

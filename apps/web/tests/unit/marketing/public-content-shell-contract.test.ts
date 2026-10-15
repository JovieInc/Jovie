import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

const routes = [
  ['blog index', 'app/(marketing)/blog/BlogFeed.tsx'],
  ['blog post', 'components/organisms/BlogPostPage.tsx'],
  ['blog category', 'components/organisms/BlogCategoryContent.tsx'],
  ['blog author', 'components/organisms/BlogAuthorPage.tsx'],
  ['changelog index', 'app/(marketing)/changelog/page.tsx'],
  ['changelog release', 'app/(marketing)/changelog/[version]/page.tsx'],
  ...['cookies', 'dmca', 'privacy', 'terms'].map(route => [
    `legal ${route}`,
    `app/(dynamic)/legal/${route}/layout.tsx`,
  ]),
] as const;

describe('canonical public content route contract', () => {
  it.each(routes)(
    '%s delegates reading geometry to the shared shell',
    (_, path) => {
      const source = read(path);
      expect(source).toContain('<MarketingContentShell');
      expect(source).not.toMatch(/max-w-(?:4xl|7xl)/);
    }
  );

  it.each(['cookies', 'dmca', 'privacy', 'terms'])(
    'legal/%s keeps the full canonical chrome',
    route => {
      const source = read('app/(dynamic)/legal/layout.tsx');
      expect(read(`app/(dynamic)/legal/${route}/layout.tsx`)).not.toContain(
        '<PublicPageShell'
      );
      expect(source).toContain('<PublicPageShell');
      expect(source).toContain("footerVariant='expanded'");
      expect(source).not.toContain("headerVariant='minimal'");
      expect(source).not.toContain('public-legal-content py-');
    }
  );

  it.each([
    'app/(marketing)/blog/error.tsx',
    'app/(marketing)/changelog/error.tsx',
    'app/(dynamic)/legal/error.tsx',
  ])('keeps %s inside the reading frame with recovery', path => {
    const source = read(path);
    expect(source).toContain('<MarketingContentShell>');
    expect(source).toContain('<ErrorBoundary');
    expect(source).toContain('reset={reset}');
    expect(source).not.toContain('<PublicPageShell');
  });

  it('uses one token-backed prose reader for blog and legal documents', () => {
    expect(read('components/molecules/LegalMarkdownReader.tsx')).toContain(
      '<BlogMarkdownReader'
    );
    const source = read('components/organisms/DocPage.tsx');
    expect(source).not.toMatch(/grid-cols-\[/);
    expect(source).toContain('<LegalSidebar');
    expect(source).toContain('{aside}');
  });

  it('keeps homepage chrome and the separate Help Center exception explicit', () => {
    expect(read('app/(home)/layout.tsx')).toContain('<PublicPageShell');
    const policy = read('../../docs/design-system/public-content-shell.md');
    expect(policy).toContain('docs.jov.ie');
    expect(policy).toContain('HelpShell');
    expect(policy).toContain('investor-portal');
    expect(read('../docs/app/layout.tsx')).toContain('<HelpShell nav={nav}>');
  });
});

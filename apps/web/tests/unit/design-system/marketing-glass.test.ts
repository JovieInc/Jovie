import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findViolations,
  isMarketingSource,
  SCAN_ROOTS,
  scanMarketingGlass,
} from '../../../scripts/lint-marketing-glass.mjs';

const webRoot = process.cwd();
const component = 'components/marketing/Fixture.tsx';

describe('marketing glass boundary', () => {
  it.each([
    '<div className="backdrop-blur-sm" />',
    '<div className="md:hover:backdrop-blur-[7px]" />',
    '<div className="[backdrop-filter:blur(7px)]" />',
    '<div style={{ backdropFilter: "blur(9px)" }} />',
    '<div style={{ WebkitBackdropFilter: "blur(9px)" }} />',
    '<div className="glass-card" />',
    '<div className={cn("frosted-glass", active && "dark-glass")} />',
    '<div className="glassmorphism" />',
    '<div className="dark-glass" />',
    '<div className={`backdrop-blur-${size}`} />',
    '<div className={`${extra} backdrop-blur-sm`} />',
    '<div className={`glass-${tone}`} />',
    'const classes = "dark-glass"; <div className={classes} />',
  ])('rejects independent component material: %s', source => {
    expect(findViolations(component, source).length).toBeGreaterThan(0);
  });

  it.each([
    '.card { backdrop-filter: blur(9px); }',
    '.card { -webkit-backdrop-filter: blur(9px); }',
    '@supports (backdrop-filter: blur(1px)) { .card { color: inherit; } }',
    '.glass-card { background: transparent; }',
    '.dark-glass { background: transparent; }',
    '.ds-glass { background: gray; }',
    '.card { @apply backdrop-blur-sm; }',
  ])('rejects independent stylesheet material: %s', source => {
    expect(
      findViolations('app/(home)/home.css', source).length
    ).toBeGreaterThan(0);
  });

  it('accepts sanctioned consumers and ignores comments and recipe identifiers', () => {
    expect(
      findViolations(
        component,
        `
      // backdrop-filter and glass-card are forbidden
      const variant = 'dark-glass';
      export const Card = () => <div className={cn('ds-glass', 'rounded-xl')} data-variant={variant} />;
    `
      )
    ).toEqual([]);
    expect(
      findViolations(
        'components/site/MarketingHeader.css',
        `
      /* backdrop-filter: blur(9px); */
      .marketing-glass-header__shell { min-height: 44px; }
    `
      )
    ).toEqual([]);
  });

  it('covers all marketing owners including the immutable footer, with only the requested hero exclusion', () => {
    for (const path of [
      component,
      'app/(marketing)/pricing/page.tsx',
      'app/(home)/home.css',
      'components/homepage/Card.tsx',
      'components/site/MarketingFooter.tsx',
      'components/organisms/HeaderNav.tsx',
    ])
      expect(isMarketingSource(path), path).toBe(true);
    expect(
      isMarketingSource('components/homepage/hero-light/HomepageHeroCanvas.css')
    ).toBe(false);
    expect(isMarketingSource('app/app/page.tsx')).toBe(false);
  });

  it('finds newly added files and fails closed on missing scan roots', () => {
    const root = mkdtempSync(join(tmpdir(), 'marketing-glass-'));
    try {
      expect(() => scanMarketingGlass(root)).toThrow();
      for (const path of SCAN_ROOTS) {
        if (/\.(css|tsx)$/.test(path)) {
          mkdirSync(dirname(join(root, path)), { recursive: true });
          writeFileSync(join(root, path), '');
        } else mkdirSync(join(root, path), { recursive: true });
      }
      expect(scanMarketingGlass(root)).toEqual([]);
      writeFileSync(
        join(root, component),
        '<div className="backdrop-blur-lg" />'
      );
      expect(scanMarketingGlass(root)).toMatchObject([
        { path: component, line: 1 },
      ]);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  it('keeps the repository free of material violations', () => {
    expect(scanMarketingGlass(webRoot)).toEqual([]);
  });

  it('enrolls the guard in author lint and both blocking CI paths', () => {
    const repo = resolve(webRoot, '../..');
    const pkg = JSON.parse(readFileSync(join(webRoot, 'package.json'), 'utf8'));
    expect(pkg.scripts.lint).toContain('lint:marketing-glass &&');
    expect(
      readFileSync(
        join(repo, '.github/workflows/source-validation.yml'),
        'utf8'
      )
    ).toContain('pnpm --filter @jovie/web run lint:marketing-glass');
    expect(
      readFileSync(join(repo, 'scripts/ci-fast-lanes.mjs'), 'utf8')
    ).toContain('pnpm --filter=@jovie/web run lint:marketing-glass &&');
  });
});

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const TARGET_DIRS = [
  join(ROOT, 'app', '(marketing)'),
  join(ROOT, 'components', 'features', 'home'),
  join(ROOT, 'components', 'features', 'pay'),
] as const;
const TARGET_FILES = [
  join(ROOT, 'components', 'organisms', 'HeaderNav.tsx'),
  join(ROOT, 'components', 'molecules', 'AuthActions.tsx'),
] as const;

const LEGACY_CTA_PATTERNS = [
  'btn-linear-login',
  'btn-linear-signup',
  'marketing-cta',
] as const;

function collectFiles(dir: string, results: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      collectFiles(fullPath, results);
      continue;
    }

    if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }

  return results;
}

describe('public CTA guard', () => {
  it('audits the exact public CTA owner modules', () => {
    const authActionsSource = readFileSync(
      join(ROOT, 'components/molecules/AuthActions.tsx'),
      'utf8'
    );
    const headerNavSource = readFileSync(
      join(ROOT, 'components/organisms/HeaderNav.tsx'),
      'utf8'
    );

    expect(authActionsSource).toContain('export function AuthActions');
    expect(headerNavSource).toContain('export function HeaderNav');
  });

  it('keeps legacy public CTA classnames out of production marketing and key public feature surfaces', () => {
    const missingDirs = TARGET_DIRS.filter(dir => !existsSync(dir));
    const missingFiles = TARGET_FILES.filter(file => !existsSync(file));
    expect(missingDirs).toEqual([]);
    expect(missingFiles).toEqual([]);

    const files = [
      ...TARGET_DIRS.flatMap(dir => collectFiles(dir)),
      ...TARGET_FILES,
    ];

    const offenders = files.filter(filePath => {
      const contents = readFileSync(filePath, 'utf8');
      return LEGACY_CTA_PATTERNS.some(pattern => contents.includes(pattern));
    });

    expect(offenders).toEqual([]);
  });

  it('locks the public HeaderNav primary CTA to the marketing ActionButton size', () => {
    const headerPath = join(ROOT, 'components', 'organisms', 'HeaderNav.tsx');
    const contents = readFileSync(headerPath, 'utf8');
    const start = contents.indexOf('function HeaderPrimaryAuthLink(');
    const end = contents.indexOf('function GlassAuthActions(', start);

    expect(start, 'HeaderPrimaryAuthLink source exists').toBeGreaterThanOrEqual(
      0
    );
    expect(end, 'HeaderPrimaryAuthLink source is bounded').toBeGreaterThan(
      start
    );

    const primaryCta = contents.slice(start, end);

    // Waitlist-first Get started / Request Access uses the canonical marketing pill.
    // HeaderPrimaryAuthLink owns the single primary-variant CTA and defaults
    // to the marketing size; the minimal pill sign-in passes md explicitly.
    expect(primaryCta).toContain("size = 'marketing'");
    expect(primaryCta).toContain("variant='primary'");
    expect(primaryCta).not.toMatch(/\bsize='(?:sm|lg|xl)'/);
  });

  it('keeps homepage public auth as a labeled text MarketingSignInLink', () => {
    const headerNav = readFileSync(
      join(ROOT, 'components/organisms/HeaderNav.tsx'),
      'utf8'
    );
    const authActions = readFileSync(
      join(ROOT, 'components/molecules/AuthActions.tsx'),
      'utf8'
    );
    const marketingHeader = readFileSync(
      join(ROOT, 'components/site/MarketingHeader.tsx'),
      'utf8'
    );
    const marketingNavigation = readFileSync(
      join(ROOT, 'data/marketingNavigation.ts'),
      'utf8'
    );
    expect(authActions).toContain('export function AuthActions');

    expect(headerNav).toContain("minimalAuthLabel?: 'Sign in' | 'Log in'");
    expect(headerNav).toContain(
      "<MarketingSignInLink variant='ghost' label={minimalLabel} />"
    );
    expect(headerNav).toContain('focus-ring-themed shrink-0 whitespace-nowrap');
    expect(headerNav).toContain('function HeaderPrimaryAuthLink');
    expect(headerNav).toContain(
      "cn('focus-ring-themed shrink-0 whitespace-nowrap', className)"
    );
    expect(headerNav).toContain('blur(var(--blur-header))');
    expect(headerNav).not.toContain('--linear-blur-header');
    expect(headerNav).not.toMatch(
      /minimalAuth[\s\S]*?<Button[\s\S]*?>Get started<\/Button>/
    );
    expect(headerNav).toContain(
      '<HeaderPrimaryAuthLink href={publicCta.href} label={publicCta.label} />'
    );
    expect(marketingNavigation).toContain("label: 'Log in'");
    expect(marketingNavigation).toContain("label: 'Find yourself'");
    expect(marketingHeader).toContain(
      'DEFAULT_MARKETING_CTA: MarketingHeaderCta = MARKETING_NAV_UTILITIES[1]'
    );
  });

  it('keys marketing nav links by href and label together', () => {
    const headerNav = readFileSync(
      join(ROOT, 'components/organisms/HeaderNav.tsx'),
      'utf8'
    );

    // Duplicate hrefs (e.g. two labels routing to the same page) must not
    // collide on the React key.
    expect(headerNav).toContain('key={`${link.href}:${link.label}`}');
  });

  it('keeps glass navigation beside the logo and the public CTA beyond its spacer', () => {
    const headerNav = readFileSync(
      join(ROOT, 'components/organisms/HeaderNav.tsx'),
      'utf8'
    );
    const headerCss = readFileSync(
      join(ROOT, 'components/organisms/HeaderNav.css'),
      'utf8'
    );
    const leadingNav = headerNav.indexOf(
      '{isHomepagePresentation || isMarketingGlass ? navLinksMarkup : null}'
    );
    const spacer = headerNav.indexOf(
      "<div className='flex-1' aria-hidden='true' />"
    );
    const trailingNav = headerNav.indexOf(
      '{isHomepagePresentation || isMarketingGlass ? null : navLinksMarkup}'
    );
    const publicActions = headerNav.indexOf('<GlassAuthActions', spacer);

    // Mutually exclusive placements preserve the other header variants while
    // keeping the glass header's CTA at the actual right content anchor.
    expect(leadingNav).toBeGreaterThanOrEqual(0);
    expect(spacer).toBeGreaterThan(leadingNav);
    expect(trailingNav).toBeGreaterThan(spacer);
    expect(publicActions).toBeGreaterThan(trailingNav);
    expect(headerNav.match(/\? navLinksMarkup : null/g)).toHaveLength(1);
    expect(headerNav.match(/\? null : navLinksMarkup/g)).toHaveLength(1);
    const glassNavRule = headerCss.match(
      /\.marketing-glass-header__nav\s*\{([^}]+)\}/
    )?.[1];
    expect(glassNavRule).toBeDefined();
    expect(glassNavRule).toContain('position: static;');
    expect(glassNavRule).not.toMatch(/position:\s*absolute|translate\(/);
  });
});

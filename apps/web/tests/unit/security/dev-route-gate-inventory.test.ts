import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEVELOPMENT_ROUTE_PROXY_ALLOWLIST,
  isProductionBlockedDebugPath,
} from '@/lib/security/production-blocked-routes';

/**
 * Guard (security triage 2026-10-25): any page whose URL looks like a
 * development surface (preview, playground, sandbox, test, debug, demo, dev,
 * exp, ui, renders, ...) must be unreachable in production, either through a
 * `requireDevelopmentOnlyPage()` call (or the render-fixture policy) in the
 * page or an ancestor layout, or through the proxy block list. `/engineering/preview` shipped with neither
 * and rendered draft stories on jov.ie.
 *
 * Intentional public exceptions live in DEVELOPMENT_ROUTE_PROXY_ALLOWLIST and
 * must be justified there. `/report` (abuse reports) is a real public route
 * and does not match this pattern.
 */
const APP_DIR = join(process.cwd(), 'app');
const DEV_SEGMENT =
  /^(preview|playground|sandbox|[a-z-]*test[a-z-]*|debug|demo|dev|exp|ui|renders|storybook|sentry-example-page)$/;

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pages(path);
    return entry.name === 'page.tsx' ? [path] : [];
  });
}

function urlSegments(file: string): string[] {
  return relative(APP_DIR, dirname(file))
    .split(sep)
    .filter(segment => segment && !/^\(.*\)$/.test(segment));
}

function toSampleUrl(segments: readonly string[]): string {
  return `/${segments
    .map(segment => (segment.startsWith('[') ? 'sample' : segment))
    .join('/')}`;
}

function hasDevelopmentGuard(file: string): boolean {
  const candidates = [file];
  for (let dir = dirname(file); dir.startsWith(APP_DIR); dir = dirname(dir)) {
    const layout = join(dir, 'layout.tsx');
    if (existsSync(layout)) candidates.push(layout);
    if (dir === APP_DIR) break;
  }
  return candidates.some(path => {
    const source = readFileSync(path, 'utf8');
    return (
      source.includes('requireDevelopmentOnlyPage(') ||
      // Screenshot render fixtures have their own explicit policy.
      /if \(!isRenderFixtureEnabled\(\)\) notFound\(\)/.test(source)
    );
  });
}

describe('development surfaces are not public in production', () => {
  const devPages = pages(APP_DIR)
    .map(file => ({ file, segments: urlSegments(file) }))
    .filter(({ segments }) => segments.some(s => DEV_SEGMENT.test(s)));

  it('finds the inventory', () => {
    expect(devPages.length).toBeGreaterThan(10);
  });

  it.each(devPages.map(({ file, segments }) => [toSampleUrl(segments), file]))(
    '%s is gated',
    (url, file) => {
      const allowlisted = (
        DEVELOPMENT_ROUTE_PROXY_ALLOWLIST as readonly string[]
      ).some(allowed => url === allowed || url.startsWith(`${allowed}/`));
      if (allowlisted) return;
      expect(
        hasDevelopmentGuard(file) || isProductionBlockedDebugPath(url),
        `${relative(APP_DIR, file)} needs requireDevelopmentOnlyPage() or a production-blocked-routes entry`
      ).toBe(true);
    }
  );

  it('keeps /report public', () => {
    expect(isProductionBlockedDebugPath('/report')).toBe(false);
    expect(existsSync(join(APP_DIR, 'report', 'page.tsx'))).toBe(true);
  });
});

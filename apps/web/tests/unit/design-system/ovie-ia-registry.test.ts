import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_VIEW_GROUPS } from '@/constants/admin-navigation';
import { APP_SCREEN_SOURCES } from '@/data/appScreens';
import {
  OVIE_PAGE_IA,
  type OviePageSpec,
  oviePageSpec,
} from '@/data/appScreens/ovie-ia';

/**
 * Every Ovie page conforms to the IA registry (docs/design-system/ovie-ia.md):
 * one page frame, sub-navigation only through AdminPage `views`/`tabs`, the
 * shell breadcrumb as the only title, and every view-group route registered.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const ADMIN_PREFIX = 'apps/web/app/app/(shell)/admin';
const OPERATOR_SOURCES = APP_SCREEN_SOURCES.filter(source =>
  source.startsWith(`${ADMIN_PREFIX}/`)
);

const read = (source: string) =>
  readFileSync(path.join(REPO_ROOT, source), 'utf8');

function isRedirectPage(text: string): boolean {
  return /\bredirect\(/.test(text) && !/<[A-Z][A-Za-z]*/.test(text);
}

function hrefToSource(href: string): string {
  return `${ADMIN_PREFIX}${href.replace(/^\/app\/ov/, '')}/page.tsx`;
}

export function ovieIaViolations(
  source: string,
  text: string,
  spec: OviePageSpec
): string[] {
  const problems: string[] = [];
  const views = /\bviews=['"](\w+)['"]/.exec(text)?.[1] ?? null;
  const hasTabs = /\btabs=\{/.test(text);
  if (spec.subnav === 'route-views') {
    if (views !== spec.views)
      problems.push(`${source}: expected views='${spec.views}'`);
  } else if (views) {
    problems.push(`${source}: views='${views}' is not registered`);
  }
  const tabsAllowed = spec.subnav === 'query-tabs' || spec.tabs === true;
  if (spec.subnav === 'query-tabs' && !hasTabs)
    problems.push(`${source}: registered query-tabs but renders none`);
  if (hasTabs && !tabsAllowed)
    problems.push(`${source}: tabs= is not registered`);
  if (/<h1[\s>]/.test(text))
    problems.push(
      `${source}: renders <h1>; the shell breadcrumb owns the title`
    );
  return problems;
}

describe('Ovie IA registry', () => {
  it('registers only real operator screens', () => {
    for (const source of Object.keys(OVIE_PAGE_IA)) {
      expect(OPERATOR_SOURCES).toContain(source);
    }
  });

  it('every operator page matches its registered sub-navigation', () => {
    const violations = OPERATOR_SOURCES.flatMap(source => {
      const text = read(source);
      return isRedirectPage(text)
        ? []
        : ovieIaViolations(source, text, oviePageSpec(source));
    });
    expect(violations).toEqual([]);
  });

  it('every view-group route is a registered page in that group', () => {
    for (const [group, { views }] of Object.entries(ADMIN_VIEW_GROUPS)) {
      for (const view of views) {
        expect(OVIE_PAGE_IA[hrefToSource(view.href)]).toMatchObject({
          subnav: 'route-views',
          views: group,
        });
      }
    }
  });

  it('rejects in-page tabs, unregistered views and page headings (deliberate red)', () => {
    const none: OviePageSpec = { subnav: 'none' };
    expect(
      ovieIaViolations('x', "<AdminPage views='shipping'>", none)
    ).toHaveLength(1);
    expect(ovieIaViolations('x', '<AdminPage tabs={{}}>', none)).toHaveLength(
      1
    );
    expect(ovieIaViolations('x', '<h1>Product</h1>', none)).toHaveLength(1);
    expect(
      ovieIaViolations('x', '<AdminPage>', {
        subnav: 'route-views',
        views: 'shipping',
      })
    ).toHaveLength(1);
  });
});

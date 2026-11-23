import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as navigationConfig from '@/components/features/dashboard/dashboard-nav/config';
import { getRailNavigation } from '@/components/features/dashboard/dashboard-nav/navigation-state';

// The Storybook elevation spec runs only in merge groups. When a PR changes whether a
// sidebar destination is gated (JOV-7733 removed Identity's requiredFlag) without
// updating the spec's expectations, every merge group that runs Storybook fails
// (`Identity` toHaveCount(0), 2026-10-26). This reads the spec from disk, so the
// disk-reading source guard runs it at PR time whenever the spec or the nav config
// changes.
//
// A destination may also leave the rail without a flag: when the header bell owns
// Home (the default customer sidebar the spec's dashboard story renders),
// `getRailNavigation` drops the rail's Home row (2026-11-14). That exemption is
// read from the real rail helper, so re-adding the row fails here too.
const SPEC = readFileSync(
  resolve(__dirname, '../../e2e/storybook-elevation.spec.ts'),
  'utf8'
);

type NavLike = { name: string; href: string; requiredFlag?: string };

const navItems = (Object.values(navigationConfig) as unknown[]).filter(
  (value): value is NavLike =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as NavLike).name === 'string' &&
    typeof (value as NavLike).href === 'string'
);

const { canonicalSidebarNavigation } = navigationConfig;
/** Rail rows of the default customer sidebar, where the header owns Home. */
const headerOwnedRail = getRailNavigation(canonicalSidebarNavigation, true);
const isDroppedByHeaderOwnedHome = (name: string) =>
  canonicalSidebarNavigation.some(item => item.name === name) &&
  !headerOwnedRail.some(item => item.name === name);

const labelsExpectedHidden = [
  ...SPEC.matchAll(
    /getByRole\('link',\s*\{\s*name:\s*'([^']+)',\s*exact:\s*true\s*\}\)\s*\)\.toHaveCount\(0\)/g
  ),
].map(match => match[1]);

const destinationLoop = SPEC.slice(
  SPEC.indexOf('for (const [name, href] of ['),
  SPEC.indexOf('const destination = page.getByRole')
);
const labelsExpectedVisible = [
  ...destinationLoop.matchAll(/\[\s*'([^']+)',\s*'([^']+)'\s*\]/g),
].map(match => ({ name: match[1], href: match[2] }));

describe('storybook-elevation sidebar expectations match the navigation config', () => {
  it('finds the spec expectations', () => {
    expect(labelsExpectedVisible.length).toBeGreaterThan(0);
  });

  it.each(labelsExpectedHidden)(
    'expects %s hidden only while flag-gated or dropped for the header-owned Home',
    name => {
      const items = navItems.filter(item => item.name === name);
      expect(
        items.length,
        `"${name}" is asserted hidden in the elevation spec but is not a nav item`
      ).toBeGreaterThan(0);
      // Structural removal, not a gate: the header bell is the only `/app`
      // entry, so the rail renders no row with this name.
      if (isDroppedByHeaderOwnedHome(name)) return;
      for (const item of items)
        expect(
          item.requiredFlag,
          `"${name}" has no requiredFlag, so it is always in the default sidebar. Update the "brand bell and search share one row" expectation in apps/web/tests/e2e/storybook-elevation.spec.ts.`
        ).toBeTruthy();
    }
  );

  it.each(labelsExpectedVisible)(
    'expects $name visible only while its nav item is ungated and links to $href',
    ({ name, href }) => {
      expect(
        headerOwnedRail.some(item => item.name === name),
        `"${name}" is not a rail row of the default sidebar; remove it from the elevation spec's destination list.`
      ).toBe(true);
      for (const item of navItems.filter(entry => entry.name === name)) {
        expect(
          item.requiredFlag,
          `"${name}" is flag-gated, so the default-flags sidebar hides it; remove it from the elevation spec's destination list.`
        ).toBeFalsy();
        expect(item.href).toBe(href);
      }
    }
  );

  // The search-slot bell always ships a qualified accessible name
  // (`Home — …`). Exact `Home` there fails Storybook Surface Matrix in
  // merge groups (PR #26136 lane-form-red, 2026-11-22).
  it('qualifies search-slot Home bell assertions', () => {
    expect(
      SPEC.includes(
        "locator('[data-sidebar-search-slot]').getByRole('link', {\n        name: 'Home',\n        exact: true,"
      ) ||
        SPEC.includes("slot.getByRole('link', { name: 'Home', exact: true })"),
      'search-slot Home must use /Home —/ (qualified), not exact "Home"'
    ).toBe(false);
    expect(SPEC).toContain('name: /Home —/');
  });
});

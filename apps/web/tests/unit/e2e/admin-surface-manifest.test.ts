import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_NAV_REGISTRY,
  adminGrowthViews,
  adminPeopleViews,
} from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';
import {
  ADMIN_MOBILE_SNAPSHOT_SURFACES,
  ADMIN_PRIMARY_NAV_SURFACES,
  ADMIN_RENDER_SURFACES,
  getAdminSurfaceById,
} from '../../e2e/utils/admin-surface-manifest';

// These checks validate inventory parity, not authenticated runtime behavior.
// State/action and exact-build certification remain JOV-7486 / JOV-7487.
describe('admin surface inventory', () => {
  it('covers the five current primary workspaces in navigation order', () => {
    expect(ADMIN_PRIMARY_NAV_SURFACES.map(surface => surface.path)).toEqual(
      ADMIN_NAV_REGISTRY.filter(item => item.section === 'workspaces').map(
        item => item.href
      )
    );
    expect(ADMIN_PRIMARY_NAV_SURFACES.map(surface => surface.id)).toEqual([
      'ops',
      'growth',
      'product',
      'operations',
      'needs-you',
    ]);
    expect(
      ADMIN_RENDER_SURFACES.filter(surface => surface.primaryWorkspace)
    ).toHaveLength(5);
  });

  it('includes each primary workspace in narrow-window snapshots', () => {
    for (const surface of ADMIN_PRIMARY_NAV_SURFACES) {
      expect(ADMIN_MOBILE_SNAPSHOT_SURFACES).toContain(surface);
    }
    expect(getAdminSurfaceById('people-contacts').primaryWorkspace).toBe(false);
    expect(getAdminSurfaceById('activity').primaryWorkspace).toBe(false);
    expect(ADMIN_MOBILE_SNAPSHOT_SURFACES).toContain(
      getAdminSurfaceById('people-contacts')
    );
  });

  it('classifies every supported People and Growth view without stale views', () => {
    for (const [path, views] of [
      [APP_ROUTES.ADMIN_PEOPLE, adminPeopleViews],
      [APP_ROUTES.ADMIN_GROWTH, adminGrowthViews],
    ] as const) {
      const actualViews = ADMIN_RENDER_SURFACES.flatMap(surface => {
        const url = new URL(surface.path, 'https://jov.ie');
        const view = url.searchParams.get('view');
        return url.pathname === path && view ? [view] : [];
      });
      expect(actualViews.toSorted()).toEqual([...views].sort());
    }
  });

  it('uses existing roots for the previously omitted workspaces and ingest', () => {
    for (const [id, file] of [
      ['product', 'app/app/(shell)/admin/product/page.tsx'],
      ['operations', 'app/app/(shell)/admin/operations/page.tsx'],
      ['needs-you', 'app/app/(shell)/admin/needs-you/page.tsx'],
      ['growth-ingest', 'app/app/(shell)/admin/growth/page.tsx'],
      ['growth-campaigns', 'app/app/(shell)/admin/growth/page.tsx'],
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source).toContain(
        `testId='${getAdminSurfaceById(id).rootTestId}'`
      );
    }
    expect(getAdminSurfaceById('people-assets').rootTestId).toBe(
      'admin-people-view-assets'
    );
  });

  it('keeps surface identifiers, snapshot names and URLs unique', () => {
    for (const key of ['id', 'snapshotSlug', 'path'] as const) {
      const values = ADMIN_RENDER_SURFACES.map(surface => surface[key]);
      expect(new Set(values).size).toBe(values.length);
    }
    expect(() => getAdminSurfaceById('missing')).toThrow(
      'Unknown admin surface'
    );
  });
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(
  import.meta.url.startsWith('file:')
    ? fileURLToPath(import.meta.url)
    : import.meta.url
);
const ADMIN_OVERVIEW_ROUTE = join(
  TEST_DIR,
  '../../../app/app/(shell)/admin/page.tsx'
);
const ADMIN_HEALTH_DASHBOARD = join(
  TEST_DIR,
  '../../../app/app/(shell)/admin/_components/AdminHealthDashboard.tsx'
);
const ADMIN_LOADING_ROUTE = join(
  TEST_DIR,
  '../../../app/app/(shell)/admin/loading.tsx'
);
const ADMIN_NAV = join(TEST_DIR, '../../../constants/admin-navigation.ts');

describe('admin overview shell normalization (JOV-5256)', () => {
  it('folds the overview index into canonical Ops at /hud', () => {
    const source = readFileSync(ADMIN_OVERVIEW_ROUTE, 'utf8');

    expect(source).toContain('redirect(APP_ROUTES.HUD)');
    expect(source).not.toContain('<AdminPage');
    expect(source).not.toContain("testId='admin-overview-page'");
  });

  it('removes the legacy overview tab toggle and workspace card duplication', () => {
    const source = readFileSync(ADMIN_OVERVIEW_ROUTE, 'utf8');

    expect(source).not.toContain('overviewCards');
    expect(source).not.toContain('view=scoreboard');
    expect(source).not.toContain('view=workspaces');
    expect(source).not.toContain('WorkspaceTabsSurface');
  });

  it('keeps the loading route in the same canonical AdminPage shell', () => {
    const source = readFileSync(ADMIN_LOADING_ROUTE, 'utf8');

    expect(source).toContain('import { AdminPage }');
    expect(source).toMatch(/title=["']Overview["']/);
    expect(source).toMatch(/testId=["']admin-overview-loading["']/);
    expect(source).not.toContain('PageShell');
  });

  it('does not keep a second metrics product on the overview redirect', () => {
    const source = readFileSync(ADMIN_OVERVIEW_ROUTE, 'utf8');

    expect(source).not.toContain('AdminHealthDashboard');
    expect(source).not.toContain('AdminScoreboardSection');
    expect(source).not.toContain('AdminKpiSection');
    expect(source).not.toContain('AdminOutreachSection');
    expect(source).not.toContain('AdminUsageSection');
    expect(source).not.toContain('AdminFounderHudSection');
    expect(source).not.toContain('AdminHeroMetrics');
  });
});

describe('admin health dashboard ownership (JOV-2098)', () => {
  it('links one signal per primary area to the detail screen', () => {
    const source = readFileSync(ADMIN_HEALTH_DASHBOARD, 'utf8');

    expect(source).toContain('admin-health-business');
    expect(source).toContain('admin-health-growth');
    expect(source).toContain('admin-health-ops');
    expect(source).toContain('admin-health-people');
    expect(source).toContain('APP_ROUTES.ADMIN_REVENUE_LIFT');
    expect(source).toContain('APP_ROUTES.ADMIN_GROWTH');
    expect(source).toContain('APP_ROUTES.ADMIN_OPS');
    expect(source).toMatch(/buildAdminPeopleHref\(["']waitlist["']\)/);
  });
});

describe('admin nav IA copy (JOV-2098)', () => {
  it('describes non-overlapping workspace purposes', () => {
    const source = readFileSync(ADMIN_NAV, 'utf8');

    expect(source).toContain(
      'Canonical company Ops — decisions, survival, bottleneck, delivery'
    );
    expect(source).not.toContain(
      'Health dashboard — one signal per area linking to detail screens'
    );
    expect(source).not.toContain('One operator HUD — need first, noise below');
    expect(source).toContain(
      'Acquisition funnel, referral, outreach, and conversion'
    );
    expect(source).toContain(
      'User table, roles, waitlist, creators, and individual actions'
    );
  });
});

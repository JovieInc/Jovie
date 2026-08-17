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
const ADMIN_NAV = join(TEST_DIR, '../../../constants/admin-navigation.ts');

describe('admin overview shell normalization (JOV-2525 + JOV-2098)', () => {
  it('keeps the overview route inside the canonical AdminPage shell', () => {
    const source = readFileSync(ADMIN_OVERVIEW_ROUTE, 'utf8');

    expect(source).toContain('import { AdminPage }');
    expect(source).toContain('<AdminPage');
    expect(source).toContain("testId='admin-overview-page'");
  });

  it('removes the legacy overview tab toggle and workspace card duplication', () => {
    const source = readFileSync(ADMIN_OVERVIEW_ROUTE, 'utf8');

    expect(source).not.toContain('overviewCards');
    expect(source).not.toContain('view=scoreboard');
    expect(source).not.toContain('view=workspaces');
    expect(source).not.toContain('WorkspaceTabsSurface');
  });

  it('renders Overview as a health dashboard only (JOV-2098)', () => {
    const source = readFileSync(ADMIN_OVERVIEW_ROUTE, 'utf8');

    expect(source).toContain('AdminHealthDashboard');
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
    expect(source).toContain("buildAdminPeopleHref('waitlist')");
  });
});

describe('admin nav IA copy (JOV-2098)', () => {
  it('describes non-overlapping workspace purposes', () => {
    const source = readFileSync(ADMIN_NAV, 'utf8');

    expect(source).toContain(
      'Health dashboard — one signal per area linking to detail screens'
    );
    expect(source).toContain('One operator HUD — need first, noise below');
    expect(source).toContain(
      'Acquisition funnel, referral, outreach, and conversion'
    );
    expect(source).toContain(
      'User table, roles, waitlist, creators, and individual actions'
    );
  });
});

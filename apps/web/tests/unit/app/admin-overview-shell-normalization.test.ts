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
const ADMIN_SCOREBOARD_SECTION = join(
  TEST_DIR,
  '../../../app/app/(shell)/admin/_components/AdminScoreboardSection.tsx'
);

describe('admin overview shell normalization (JOV-2525)', () => {
  it('keeps the overview route inside the canonical AdminPage shell', () => {
    const source = readFileSync(ADMIN_OVERVIEW_ROUTE, 'utf8');

    expect(source).toContain('import { AdminPage }');
    expect(source).toContain('<AdminPage');
    expect(source).toContain("testId='admin-overview-page'");
    expect(source).toContain('hero={');
    expect(source).not.toContain('AdminToolPage');
    expect(source).not.toContain('AdminWorkspacePage');
  });

  it('removes the legacy overview tab toggle and workspace card duplication', () => {
    const source = readFileSync(ADMIN_OVERVIEW_ROUTE, 'utf8');

    expect(source).not.toContain('overviewCards');
    expect(source).not.toContain('view=scoreboard');
    expect(source).not.toContain('view=workspaces');
    expect(source).not.toContain('WorkspaceTabsSurface');
  });

  it('renders hero metrics via AnalyticsCard hero variant', () => {
    const source = readFileSync(ADMIN_SCOREBOARD_SECTION, 'utf8');

    expect(source).toContain("variant='hero'");
    expect(source).not.toContain('function HeroMetric');
    expect(source).toContain('AdminHeroMetrics');
    expect(source).toContain('min-h-[75px]');
  });
});

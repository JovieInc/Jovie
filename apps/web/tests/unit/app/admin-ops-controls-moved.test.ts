import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * JOV-4639 — environment controls belong on Ops, campaign defaults belong
 * with Growth, and people intake defaults belong with the waitlist.
 */

function findSourceFile(...candidates: string[]): string {
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Could not find source file. Checked: ${candidates.join(', ')}`
    );
  }
  return found;
}

function collectTsxFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectTsxFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

const SETTINGS_ADMIN_PAGE = findSourceFile(
  resolve(process.cwd(), 'app/app/(shell)/settings/admin/page.tsx'),
  resolve(process.cwd(), 'apps/web/app/app/(shell)/settings/admin/page.tsx')
);

const OPERATIONAL_CONTROL_PANEL = findSourceFile(
  resolve(
    process.cwd(),
    'components/features/admin/OperationalControlPanel.tsx'
  ),
  resolve(
    process.cwd(),
    'apps/web/components/features/admin/OperationalControlPanel.tsx'
  )
);

const OPS_PAGE = findSourceFile(
  resolve(process.cwd(), 'app/app/(shell)/admin/ops/page.tsx'),
  resolve(process.cwd(), 'apps/web/app/app/(shell)/admin/ops/page.tsx')
);

const GROWTH_COLLAPSIBLES = findSourceFile(
  resolve(process.cwd(), 'components/features/admin/leads/GtmCollapsibles.tsx'),
  resolve(
    process.cwd(),
    'apps/web/components/features/admin/leads/GtmCollapsibles.tsx'
  )
);

const PEOPLE_PAGE = findSourceFile(
  resolve(process.cwd(), 'app/app/(shell)/admin/people/page.tsx'),
  resolve(process.cwd(), 'apps/web/app/app/(shell)/admin/people/page.tsx')
);

const SETTINGS_ROUTE_DIR = findSourceFile(
  resolve(process.cwd(), 'app/app/(shell)/settings'),
  resolve(process.cwd(), 'apps/web/app/app/(shell)/settings')
);

const OPERATIONAL_PANEL_MARKERS = [
  'WaitlistSettingsPanel',
  'CampaignSettingsPanel',
  'Toggle waitlist gate',
  'Toggle auto-accept',
  'Toggle dev toolbar',
  'Manual approval gate',
] as const;

describe('JOV-4639 admin settings are owned by their workspace', () => {
  it('keeps /settings/admin as a redirect-only pointer to Ops', () => {
    const source = readFileSync(SETTINGS_ADMIN_PAGE, 'utf8');

    expect(source).toContain('redirect(APP_ROUTES.ADMIN_OPS)');
    expect(source).toContain('routeContext.dashboardData.isAdmin');
    expect(source).not.toContain('WaitlistSettingsPanel');
    expect(source).not.toContain('CampaignSettingsPanel');
    expect(source).not.toContain('OperationalControlPanel');
    expect(source).not.toContain('SettingsToggleRow');
  });

  it('keeps only environment controls on Ops', () => {
    const opsPage = readFileSync(OPS_PAGE, 'utf8');
    const panel = readFileSync(OPERATIONAL_CONTROL_PANEL, 'utf8');

    expect(opsPage).toContain('OperationalControlPanel');
    expect(opsPage).toContain('<OperationalControlPanel');
    expect(panel).toContain("data-testid='operational-control-panel'");
    expect(panel).toContain('Dev toolbar');
    expect(panel).not.toContain('WaitlistSettingsPanel');
    expect(panel).not.toContain('CampaignSettingsPanel');
  });

  it('mounts campaign defaults in Growth advanced settings and waitlist defaults in People', () => {
    const growthCollapsibles = readFileSync(GROWTH_COLLAPSIBLES, 'utf8');
    const peoplePage = readFileSync(PEOPLE_PAGE, 'utf8');

    expect(growthCollapsibles).toContain('CampaignSettingsPanel');
    expect(growthCollapsibles).toContain("title='Advanced Settings'");
    expect(peoplePage).toContain('WaitlistSettingsPanel');
    expect(peoplePage).toContain('<WaitlistSettingsPanel');
  });

  it('does not reintroduce operational control panels under Settings routes', () => {
    const settingsFiles = collectTsxFiles(SETTINGS_ROUTE_DIR);

    expect(settingsFiles.length).toBeGreaterThan(0);

    for (const filePath of settingsFiles) {
      const source = readFileSync(filePath, 'utf8');
      for (const marker of OPERATIONAL_PANEL_MARKERS) {
        // The admin redirect page may mention ADMIN_OPS / isAdmin only.
        expect(source).not.toContain(marker);
      }
    }
  });
});

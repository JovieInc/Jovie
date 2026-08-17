import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(
  import.meta.url.startsWith('file:')
    ? fileURLToPath(import.meta.url)
    : import.meta.url
);

const OPS_ROUTE_DIR = join(TEST_DIR, '../../../app/app/(shell)/admin/ops');
const OPS_PAGE = join(OPS_ROUTE_DIR, 'page.tsx');
const HUD_PAGE = join(TEST_DIR, '../../../app/hud/page.tsx');
const HUD_DASHBOARD_CLIENT = join(OPS_ROUTE_DIR, 'HudDashboardClient.tsx');
const HUD_STATUS_PILL = join(OPS_ROUTE_DIR, 'HudStatusPill.tsx');
const TIM_ACTION_REQUIRED_SECTION = join(
  TEST_DIR,
  '../../../components/features/admin/TimActionRequiredSection.tsx'
);
const WHAT_SHIPPED = join(
  TEST_DIR,
  '../../../components/features/admin/WhatShipped.tsx'
);

const OPERATIONAL_CONTROL_PANEL = join(
  TEST_DIR,
  '../../../components/features/admin/OperationalControlPanel.tsx'
);

const OPS_COMPONENT_FILES = [
  OPS_PAGE,
  HUD_DASHBOARD_CLIENT,
  HUD_STATUS_PILL,
  OPERATIONAL_CONTROL_PANEL,
  WHAT_SHIPPED,
  join(OPS_ROUTE_DIR, 'HudClockClient.tsx'),
] as const;

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

describe('admin ops shell normalization', () => {
  it('keeps Ovie inside AdminPage and treats ops as a redirect', () => {
    const hud = readSource(HUD_PAGE);
    const ops = readSource(OPS_PAGE);

    expect(hud).toContain('import { AdminPage }');
    expect(hud).toContain('<AdminPage');
    expect(hud).toContain("tokenOk ? 'token' : 'shell'");
    expect(hud).toContain(
      "density={tokenOk || fullscreen ? 'kiosk' : 'shell'}"
    );
    expect(ops).toContain('redirect(APP_ROUTES.HUD)');
    expect(ops).not.toContain('<AdminPage');
  });

  it('mounts the consolidated operational control panel below the HUD dashboard', () => {
    const source = readSource(HUD_PAGE);

    expect(source).toContain('OperationalControlPanel');
    expect(source).toContain('<OperationalControlPanel');
  });

  it('does not keep nightly testing agent chrome on the ops redirect', () => {
    const source = readSource(OPS_PAGE);

    expect(source).not.toContain('getNightlyTestingAgentStatus');
    expect(source).not.toContain("data-testid='nightly-testing-agent-status'");
  });

  it('does not reintroduce uppercase tracked SectionEyebrow styling', () => {
    const source = readSource(HUD_DASHBOARD_CLIENT);

    expect(source).not.toContain('SectionEyebrow');
    expect(source).not.toMatch(
      /className=['"][^'"]*(uppercase[^'"]*tracking|tracking[^'"]*uppercase)[^'"]*['"]/
    );
  });

  it('mounts system health before WhatShipped', () => {
    const hudSource = readSource(HUD_DASHBOARD_CLIENT);

    expect(hudSource).toContain('import { WhatShipped }');
    expect(hudSource).toContain('<WhatShipped kioskToken={kioskToken} />');
    expect(hudSource.indexOf('<HudSystemHealthStrip')).toBeLessThan(
      hudSource.indexOf('<WhatShipped')
    );
  });

  it('uses the shared shell row frame for what shipped rows', () => {
    const whatShippedSource = readSource(WHAT_SHIPPED);

    expect(whatShippedSource).toContain(
      "import { ShellListRowFrame } from '@/components/organisms/table';"
    );
    expect(whatShippedSource).toContain('<ShellListRowFrame');
  });

  it('normalizes admin ops list rows onto the shared shell row frame', () => {
    const hudSource = readSource(HUD_DASHBOARD_CLIENT);
    const actionSource = readSource(TIM_ACTION_REQUIRED_SECTION);

    expect(hudSource).toContain(
      "import { ShellListRowFrame } from '@/components/organisms/table';"
    );
    expect(actionSource).toContain(
      "import { ShellListRowFrame } from '@/components/organisms/table';"
    );
    expect(hudSource).not.toContain(
      'grid gap-1.5 border-subtle border-b py-2.5 last:border-b-0'
    );
    expect(hudSource).not.toContain(
      'rounded-xl border border-subtle bg-surface-0 px-3 py-2.5'
    );
    expect(actionSource).not.toContain(
      'rounded-xl border border-subtle bg-surface-0 px-3 py-2.5'
    );
  });

  it('uses tokenized motion durations in ops components', () => {
    for (const filePath of OPS_COMPONENT_FILES) {
      const source = readSource(filePath);

      expect(source).not.toMatch(/\bduration-(150|200)\b/);
    }
  });

  it('keeps HudStatusPill quiet and non-uppercase', () => {
    const source = readSource(HUD_STATUS_PILL);

    expect(source).not.toContain('uppercase');
    expect(source).not.toMatch(/\btracking-\[/);
    expect(source).toContain('font-medium');
    expect(source).toContain('getAccentCssVars');
    expect(source).toContain('HUD_TONE_ACCENT');
  });
});

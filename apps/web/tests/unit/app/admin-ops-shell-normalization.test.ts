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
const HUD_DASHBOARD_CLIENT = join(OPS_ROUTE_DIR, 'HudDashboardClient.tsx');
const HUD_STATUS_PILL = join(OPS_ROUTE_DIR, 'HudStatusPill.tsx');
const TIM_ACTION_REQUIRED_SECTION = join(
  TEST_DIR,
  '../../../components/features/admin/TimActionRequiredSection.tsx'
);

const OPS_COMPONENT_FILES = [
  OPS_PAGE,
  HUD_DASHBOARD_CLIENT,
  HUD_STATUS_PILL,
  join(OPS_ROUTE_DIR, 'HudClockClient.tsx'),
] as const;

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

describe('admin ops shell normalization', () => {
  it('keeps the ops route inside AdminToolPage while preserving kiosk mode', () => {
    const source = readSource(OPS_PAGE);

    expect(source).toContain('import { AdminToolPage }');
    expect(source).toContain('<AdminToolPage');
    expect(source).toContain("value === 'kiosk' ? 'admin-kiosk' : 'shell'");
    expect(source).toContain("presentationMode='admin-kiosk'");
    expect(source).toContain("density='kiosk'");
  });

  it('does not reintroduce uppercase tracked SectionEyebrow styling', () => {
    const source = readSource(HUD_DASHBOARD_CLIENT);

    expect(source).not.toContain('SectionEyebrow');
    expect(source).not.toMatch(
      /className=['"][^'"]*(uppercase[^'"]*tracking|tracking[^'"]*uppercase)[^'"]*['"]/
    );
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
    expect(source).toContain('font-[510]');
    expect(source).toContain('getAccentCssVars');
    expect(source).toContain('HUD_TONE_ACCENT');
  });
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  composeHudForPresentation,
  getHudNeedBand,
  getHudNoiseBand,
  HUD_NEED_SECTION_IDS,
  HUD_NOISE_SECTION_IDS,
  HUD_SECTION_TEST_IDS,
  type HudPresentation,
  needSignalIds,
} from '@/lib/hud/compose-hud-bands';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const HUD_DASHBOARD_CLIENT = join(
  TEST_DIR,
  '../../../../app/app/(shell)/admin/ops/HudDashboardClient.tsx'
);

const PRESENTATIONS: readonly HudPresentation[] = ['shell', 'kiosk', 'token'];

describe('composeHudForPresentation', () => {
  it('is the shipped composer used by HudDashboardClient for both presentations', () => {
    const source = readFileSync(HUD_DASHBOARD_CLIENT, 'utf8');
    expect(source).toContain('composeHudForPresentation');
    expect(source).toContain("from '@/lib/hud/compose-hud-bands'");
    expect(source).toContain('composeHudForPresentation(presentation)');
    expect(source).not.toMatch(/if \(isShell\) \{/);
  });

  it('orders need then noise the same for shell, kiosk, and token', () => {
    const composed = PRESENTATIONS.map(presentation => ({
      presentation,
      sections: composeHudForPresentation(presentation),
    }));

    const [first, ...rest] = composed;
    expect(first).toBeDefined();
    for (const other of rest) {
      expect(other.sections).toEqual(first?.sections);
    }

    for (const { sections } of composed) {
      expect(needSignalIds(sections)).toEqual([...HUD_NEED_SECTION_IDS]);
      expect(getHudNeedBand(sections).map(entry => entry.id)).toEqual([
        'action-required',
        'cash-mrr',
        'bottleneck',
        'shipper',
        'factory-health',
      ]);
      expect(getHudNeedBand(sections).map(entry => entry.testId)).toEqual([
        HUD_SECTION_TEST_IDS['action-required'],
        HUD_SECTION_TEST_IDS['cash-mrr'],
        HUD_SECTION_TEST_IDS.bottleneck,
        HUD_SECTION_TEST_IDS.shipper,
        HUD_SECTION_TEST_IDS['factory-health'],
      ]);

      const noiseIds = getHudNoiseBand(sections).map(entry => entry.id);
      expect(noiseIds.slice(0, 4)).toEqual([
        'morning-walk',
        'design-jury',
        'velocity',
        'agent-runs',
      ]);
      expect(noiseIds).toEqual([...HUD_NOISE_SECTION_IDS]);

      const lastNeedIndex = HUD_NEED_SECTION_IDS.length - 1;
      for (const noiseId of [
        'design-jury',
        'velocity',
        'agent-runs',
        'what-shipped',
      ] as const) {
        const noiseIndex = sections.findIndex(entry => entry.id === noiseId);
        expect(noiseIndex).toBeGreaterThan(lastNeedIndex);
      }
    }
  });

  it('includes each need signal once', () => {
    for (const presentation of PRESENTATIONS) {
      const sections = composeHudForPresentation(presentation);
      const needIds = needSignalIds(sections);
      expect(new Set(needIds).size).toBe(needIds.length);
      expect(needIds.filter(id => id === 'cash-mrr')).toHaveLength(1);
      expect(needIds.filter(id => id === 'shipper')).toHaveLength(1);
      expect(needIds.filter(id => id === 'factory-health')).toHaveLength(1);
      expect(needIds.filter(id => id === 'action-required')).toHaveLength(1);
      expect(needIds.filter(id => id === 'bottleneck')).toHaveLength(1);
    }
  });

  it('does not restate cash, shipper, or factory health in sibling need tiles', () => {
    const walk = readFileSync(
      join(
        TEST_DIR,
        '../../../../components/features/admin/hud/FounderMorningWalkCard.tsx'
      ),
      'utf8'
    );
    const kpi = readFileSync(
      join(
        TEST_DIR,
        '../../../../components/features/admin/hud/HudKpiSubgrid.tsx'
      ),
      'utf8'
    );
    const health = readFileSync(
      join(
        TEST_DIR,
        '../../../../components/features/admin/hud/HudSystemHealthStrip.tsx'
      ),
      'utf8'
    );
    const shipper = readFileSync(
      join(
        TEST_DIR,
        '../../../../components/features/admin/hud/HudShipperPanels.tsx'
      ),
      'utf8'
    );

    expect(walk).not.toContain('MRR {');
    expect(walk).not.toContain('Cash {');
    expect(kpi).not.toContain("label: 'Cash'");
    expect(kpi).not.toContain('hud-kpi-cash');
    expect(health).not.toContain("name: 'Shipper'");
    expect(shipper).not.toContain("data-testid='hud-what-shipped-panel'");
  });
});

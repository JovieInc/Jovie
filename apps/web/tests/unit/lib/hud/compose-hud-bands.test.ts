import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  composeHudForPresentation,
  HUD_SECTION_IDS,
  HUD_SECTION_TEST_IDS,
  type HudPresentation,
} from '@/lib/hud/compose-hud-bands';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const HUD_DASHBOARD_CLIENT = join(
  TEST_DIR,
  '../../../../app/app/(shell)/admin/ops/HudDashboardClient.tsx'
);

const PRESENTATIONS: readonly HudPresentation[] = ['shell', 'kiosk', 'token'];

describe('composeHudForPresentation', () => {
  it('is the shipped composer used by HudDashboardClient for every presentation', () => {
    const source = readFileSync(HUD_DASHBOARD_CLIENT, 'utf8');
    expect(source).toContain('composeHudForPresentation');
    expect(source).toContain("from '@/lib/hud/compose-hud-bands'");
    expect(source).toContain('composeHudForPresentation(presentation)');
    expect(source).not.toMatch(/if \(isShell\) \{/);
  });

  it('renders the same executive cockpit order for shell, kiosk, and token', () => {
    const composed = PRESENTATIONS.map(presentation =>
      composeHudForPresentation(presentation)
    );

    for (const sections of composed) {
      expect(sections.map(entry => entry.id)).toEqual([
        'company-metrics',
        'shipping',
        'exceptions',
        'action-required',
        'whats-new',
        'bottlenecks',
      ]);
      expect(sections.map(entry => entry.testId)).toEqual(
        HUD_SECTION_IDS.map(id => HUD_SECTION_TEST_IDS[id])
      );
    }
  });

  it('keeps Ops an executive overview — no subsystem panels in the client', () => {
    const source = readFileSync(HUD_DASHBOARD_CLIENT, 'utf8');
    for (const banned of [
      'HudEnvExceptionsPanel',
      'HermesDispatchControls',
      'AgentOsRunsPanel',
      'ShippingVelocityChart',
      'OperationalTasksPanel',
      'DesignProposalReviewPanel',
      'VisualQaReviewPanel',
      'SummerCardReviewPanel',
      'FounderFunnelBand',
    ]) {
      expect(source).not.toContain(banned);
    }
  });

  it('keeps Morning Walk a single action, not a section', () => {
    const source = readFileSync(HUD_DASHBOARD_CLIENT, 'utf8');
    expect(source).toContain('FounderMorningWalkCard');
    expect(source).toContain('compact');
    expect(composeHudForPresentation('shell').map(s => s.id)).not.toContain(
      'morning-walk'
    );
  });
});

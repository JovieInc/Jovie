import { describe, expect, it } from 'vitest';
import {
  buildChangeAwareCapturePlan,
  isNonUiPush,
  resolveAffectedScreenshotScenarioIds,
} from '@/lib/agent-os/design-taste-jury/change-aware';
import { SCREENSHOT_SCENARIO_IDS } from '@/lib/screenshots/registry';

describe('design-taste-jury change-aware capture', () => {
  it('skips all captures for non-UI pushes', () => {
    const changedFiles = [
      'apps/web/lib/db/schema.ts',
      'apps/web/app/api/cron/cleanup/route.ts',
      '.github/workflows/ci.yml',
    ];

    expect(isNonUiPush(changedFiles)).toBe(true);

    const plan = buildChangeAwareCapturePlan({ changedFiles });

    expect(plan.isNonUiPush).toBe(true);
    expect(plan.capture).toHaveLength(0);
    expect(plan.skipped.length).toBe(SCREENSHOT_SCENARIO_IDS.size);
    expect(resolveAffectedScreenshotScenarioIds(changedFiles).size).toBe(0);
  });

  it('captures only screenshots touched by a surgical UI diff', () => {
    const changedFiles = [
      'apps/web/features/dashboard/insights/InsightsPanelView.tsx',
    ];

    const affected = resolveAffectedScreenshotScenarioIds(changedFiles);
    const plan = buildChangeAwareCapturePlan({ changedFiles });

    expect(plan.isNonUiPush).toBe(false);
    expect(affected.has('dashboard-analytics-desktop')).toBe(true);
    expect(affected.has('marketing-home-desktop')).toBe(false);
    expect(plan.capture.map(entry => entry.scenarioId)).toEqual([
      'dashboard-analytics-desktop',
    ]);
    expect(plan.skipped).not.toContain('dashboard-analytics-desktop');
    expect(plan.skipped).toContain('marketing-home-desktop');
  });

  it('uses device-mockup capture style for marketing surfaces', () => {
    const changedFiles = ['apps/web/app/(home)/page.tsx'];
    const plan = buildChangeAwareCapturePlan({ changedFiles });
    const homepageCapture = plan.capture.find(
      entry => entry.scenarioId === 'marketing-home-desktop'
    );

    expect(homepageCapture?.captureStyle).toBe('device-mockup');
  });
});

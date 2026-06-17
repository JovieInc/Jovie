import { describe, expect, it } from 'vitest';
import { buildDesignTasteCapturePlan } from '@/lib/agent-os/design-taste-jury/capture-plan';
import { analyzeDesignTasteChangeScope } from '@/lib/agent-os/design-taste-jury/change-detection';

describe('design-taste-jury capture plan', () => {
  it('skips capture when there are no UI changes', () => {
    const changeScope = analyzeDesignTasteChangeScope([
      'apps/web/lib/env-server.ts',
    ]);

    const plan = buildDesignTasteCapturePlan({
      runId: 'jury-001',
      changeScope,
    });

    expect(plan.skipped).toBe(true);
    expect(plan.targets).toEqual([]);
  });

  it('captures only changed surfaces with marketing mockup mode', () => {
    const changeScope = analyzeDesignTasteChangeScope([
      'apps/web/app/(home)/page.tsx',
    ]);

    const plan = buildDesignTasteCapturePlan({
      runId: 'jury-002',
      changeScope,
    });

    expect(plan.skipped).toBe(false);
    expect(plan.targets.map(target => target.surfaceId)).toEqual(['homepage']);
    expect(plan.targets[0]?.captureMode).toBe('device-mockup');
    expect(plan.unchangedSurfaceIds).toContain('dashboard-releases');
  });

  it('uses raw capture mode for product UI surfaces', () => {
    const changeScope = analyzeDesignTasteChangeScope([
      'apps/web/components/features/dashboard/organisms/release-provider-matrix/ReleasesExperience.tsx',
    ]);

    const plan = buildDesignTasteCapturePlan({
      runId: 'jury-003',
      changeScope,
    });

    const releasesTarget = plan.targets.find(
      target => target.surfaceId === 'dashboard-releases'
    );

    expect(releasesTarget?.captureMode).toBe('raw');
  });
});

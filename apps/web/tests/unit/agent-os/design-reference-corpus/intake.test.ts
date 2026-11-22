import { describe, expect, it } from 'vitest';

import {
  INTAKE_SURFACE_IDS,
  isScheduledIntakeEnabled,
  loadDesignRefsIntakeConfig,
} from '@/lib/agent-os/design-reference-corpus/intake/config';
import { coverageForSurface } from '@/lib/agent-os/design-reference-corpus/intake/coverage';
import {
  countSeedsPerSurface,
  loadScoutSeeds,
} from '@/lib/agent-os/design-reference-corpus/intake/seeds';
import { IntakeSpendBudget } from '@/lib/agent-os/design-reference-corpus/intake/spend';
import type { DesignReferenceCorpus } from '@/lib/agent-os/design-reference-corpus/types';
import { designRefsDir } from '@/scripts/design-refs-store';

const CANON = designRefsDir();

describe('design reference intake config', () => {
  it('loads the intake config with a written spend cap', async () => {
    const config = await loadDesignRefsIntakeConfig(CANON);
    expect(config.schema).toBe('jovie.design-refs-intake/v1');
    expect(config.scheduledEnabledDefault).toBe(false);
    expect(config.spendCap.maxBrowserCapturesPerRun).toBeGreaterThan(0);
    expect(config.spendCap.note.length).toBeGreaterThan(20);
    expect(config.viewports.desktop.width).toBe(1440);
    expect(config.viewports.mobile.width).toBe(390);
    expect(config.colorScheme).toBe('dark');
  });

  it('defaults scheduled runs to disabled unless explicitly enabled', () => {
    expect(isScheduledIntakeEnabled({})).toBe(false);
    expect(
      isScheduledIntakeEnabled({ DESIGN_REFS_SCHEDULED_ENABLED: '0' })
    ).toBe(false);
    expect(
      isScheduledIntakeEnabled({ DESIGN_REFS_SCHEDULED_ENABLED: '1' })
    ).toBe(true);
  });

  it('tracks browser captures against the spend cap', async () => {
    const config = await loadDesignRefsIntakeConfig(CANON);
    const budget = new IntakeSpendBudget({
      ...config.spendCap,
      maxBrowserCapturesPerRun: 2,
    });
    budget.recordBrowserCapture();
    budget.recordBrowserCapture();
    expect(() => budget.recordBrowserCapture()).toThrow(/browser capture cap/u);
  });
});

describe('design reference scout seed coverage', () => {
  it('provides at least eight seeds for every intake surface', async () => {
    const config = await loadDesignRefsIntakeConfig(CANON);
    const seeds = await loadScoutSeeds(CANON);
    const counts = countSeedsPerSurface(seeds);
    for (const surface of INTAKE_SURFACE_IDS) {
      const corpusStyle = coverageForSurface(
        config,
        { references: {} } as DesignReferenceCorpus,
        surface
      );
      expect(corpusStyle.surface).toBe(surface);
      const direct = counts.get(surface) ?? 0;
      const legacy =
        surface === 'onboarding-start' ? (counts.get('golden-path') ?? 0) : 0;
      expect(direct + legacy).toBeGreaterThanOrEqual(
        config.minReferencesPerSurface
      );
    }
  });
});

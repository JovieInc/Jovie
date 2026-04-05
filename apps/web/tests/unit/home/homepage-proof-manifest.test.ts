import { describe, expect, it } from 'vitest';
import { HOMEPAGE_PROOF_ASSETS } from '@/features/home/home-surface-seed';
import {
  SCREENSHOT_SCENARIO_IDS,
  SCREENSHOT_SCENARIOS,
} from '@/lib/screenshots/registry';

describe('Homepage proof manifest', () => {
  it('every proof asset references a valid screenshot scenario', () => {
    for (const asset of HOMEPAGE_PROOF_ASSETS) {
      expect(
        SCREENSHOT_SCENARIO_IDS.has(asset.scenarioId),
        `Proof asset "${asset.id}" references unknown scenario "${asset.scenarioId}"`
      ).toBe(true);
    }
  });

  it('every proof asset has a non-empty alt text', () => {
    for (const asset of HOMEPAGE_PROOF_ASSETS) {
      expect(asset.alt.length).toBeGreaterThan(0);
    }
  });

  it('proof asset IDs are unique', () => {
    const ids = HOMEPAGE_PROOF_ASSETS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('phone-kind proof assets reference mobile viewport scenarios', () => {
    for (const asset of HOMEPAGE_PROOF_ASSETS) {
      if (asset.kind === 'phone') {
        const scenario = SCREENSHOT_SCENARIOS.find(
          s => s.id === asset.scenarioId
        );
        expect(
          scenario?.viewport,
          `Phone proof "${asset.id}" should reference a mobile scenario`
        ).toBe('mobile');
      }
    }
  });
});

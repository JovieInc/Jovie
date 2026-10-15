import { describe, expect, it } from 'vitest';
import { buildChangeAwareCapturePlan } from '@/lib/agent-os/design-taste-jury/change-aware';
import {
  buildDesignTasteJuryPrompt,
  DESIGN_TASTE_JURY_RUBRIC,
} from '@/lib/agent-os/design-taste-jury/rubric';

describe('design-taste-jury rubric', () => {
  it('gives jurors named checks for each non-deterministic UI-feel criterion', () => {
    expect(DESIGN_TASTE_JURY_RUBRIC).toMatchObject({
      'optical-alignment': {
        name: 'Optical alignment',
        description: expect.stringMatching(/perceived centering.*baselines/i),
      },
      'shadow-depth': {
        name: 'Shadow depth',
        description: expect.stringMatching(
          /elevation hierarchy.*light and dark/i
        ),
      },
      'stagger-animation': {
        name: 'Stagger and animation quality',
        description: expect.stringMatching(/stagger.*easing.*reduced.motion/i),
      },
    });
  });

  it('prompts only for affected captures and requires evidence for motion judgments', () => {
    const plan = buildChangeAwareCapturePlan({
      changedFiles: [
        'apps/web/features/dashboard/insights/InsightsPanelView.tsx',
      ],
    });
    const prompt = buildDesignTasteJuryPrompt(plan);

    expect(prompt).toContain('dashboard-analytics-desktop');
    expect(prompt).not.toContain('marketing-home-desktop');
    for (const [criterion, check] of Object.entries(DESIGN_TASTE_JURY_RUBRIC)) {
      expect(prompt).toContain(`${criterion}: ${check.name}`);
      expect(prompt).toContain(check.description);
    }
    expect(prompt).toContain('before/after');
    expect(prompt).toContain('criteria');
    expect(prompt).toContain('objective: false');
    expect(prompt).toContain(
      'Do not infer timing or smoothness from still screenshots'
    );
    expect(prompt).toContain('not assessable');
  });

  it('does not request a jury review for a non-UI push or an empty capture plan', () => {
    const plan = buildChangeAwareCapturePlan({ changedFiles: ['README.md'] });

    expect(buildDesignTasteJuryPrompt(plan)).toBeNull();
    expect(
      buildDesignTasteJuryPrompt({ ...plan, isNonUiPush: false })
    ).toBeNull();
  });
});

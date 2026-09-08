import { describe, expect, it } from 'vitest';
import {
  assessRisk,
  countTotalDiffLines,
} from '../../scripts/overnight-qa/risk';

describe('overnight-qa risk assessment', () => {
  it('marks safe diffs as auto-merge eligible', () => {
    const risk = assessRisk({
      changedFiles: ['apps/web/tests/scripts/overnight-qa-risk.test.ts'],
      totalDiffLines: 24,
    });

    expect(risk.blocked).toBe(false);
    expect(risk.autoMergeEligible).toBe(true);
    expect(risk.labels).toEqual(['automerge']);
  });

  it('routes billing and onboarding diffs through automated verification', () => {
    const risk = assessRisk({
      changedFiles: [
        'apps/web/app/api/billing/portal/route.ts',
        'apps/web/app/onboarding/page.tsx',
      ],
      totalDiffLines: 75,
    });

    expect(risk.blocked).toBe(false);
    expect(risk.autoMergeEligible).toBe(true);
    expect(risk.labels).toEqual(
      expect.arrayContaining(['automerge', 'testing'])
    );
    expect(risk.labels).not.toContain('needs-human');
    expect(risk.reasons.join('\n')).toContain('automated billing verification');
    expect(risk.reasons.join('\n')).toContain(
      'Onboarding and profile ownership'
    );
  });

  it('keeps oversize diffs automated while requiring complete CI coverage', () => {
    const changedFiles = Array.from({ length: 11 }, (_, index) => {
      return `apps/web/tests/unit/overnight-${index}.test.ts`;
    });
    const risk = assessRisk({
      changedFiles,
      totalDiffLines: 401,
    });

    expect(risk.blocked).toBe(false);
    expect(risk.autoMergeEligible).toBe(true);
    expect(risk.reasons).toEqual(
      expect.arrayContaining([
        'Diff touches 11 files; CI must verify the complete change set.',
        'Diff is 401 lines; CI must verify the complete change set.',
      ])
    );
  });

  it('counts numstat output including binary placeholders safely', () => {
    expect(
      countTotalDiffLines(
        [
          '12\t8\tapps/web/app/page.tsx',
          '-\t-\tapps/web/public/logo.png',
          '3\t0\tapps/web/tests/example.test.ts',
        ].join('\n')
      )
    ).toBe(23);
  });
});

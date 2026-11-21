import { describe, expect, it } from 'vitest';
import { coneScoreboard } from '../prod-cone-cases.mjs';

/** Minimal surface receipt for scoreboard clobber regressions. */
const receipt = (surface, checks, status = 'passed', blocker = null) => ({
  surface,
  status,
  blocker,
  checks,
});

describe('coneScoreboard clobber guard', () => {
  // Split from prod-cone-cases.test.mjs to stay under size-500 (JOV-9826).
  it('a blocked surface never clobbers a producer check that already ran', () => {
    // Regression for discussion_r4650659684: whole-surface blocked fill-in
    // must only cover absent producers, not overwrite a passed check.
    const scoreboard = coneScoreboard([
      receipt(
        'landing',
        [
          { id: 'landing-renders', status: 'passed', summary: 'ok' },
          {
            id: 'served-sha-matches-promotion',
            status: 'blocked',
            summary: 'production serves abc, promotion was def',
          },
        ],
        'blocked',
        'served-sha-matches-promotion: production serves abc, promotion was def'
      ),
    ]);
    const renders = scoreboard.cases.find(
      c => c.id === 'cone-entry-landing-renders'
    );
    expect(renders.status).toBe('passed');
    expect(renders.summary).toBe('ok');
    const handoff = scoreboard.cases.find(
      c => c.id === 'cone-entry-claim-handoff'
    );
    expect(handoff.status).toBe('blocked');
    expect(handoff.summary).toContain('serves abc');
  });
});

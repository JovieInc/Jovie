import { describe, expect, it } from 'vitest';
import {
  classifyAcceptedFindings,
  classifyFinding,
  scopeDecision,
  scopeExpansion,
  shouldPauseForReclassification,
} from '../scope-governor.mjs';

describe('scope governor', () => {
  const baseScope = {
    originalFiles: 4,
    originalNonTestLoc: 100,
    currentFiles: 4,
    currentNonTestLoc: 100,
  };

  it('labels accepted blockers and follow-ups', () => {
    expect(classifyFinding({ accepted: true, blocker: true }, baseScope)).toBe(
      'in-scope blocker'
    );
    expect(classifyFinding({ accepted: true }, baseScope)).toBe('follow-up');
    expect(
      classifyAcceptedFindings(
        [{ accepted: true, blocker: true }, { accepted: true }],
        baseScope
      ).map(finding => finding.classification)
    ).toEqual(['in-scope blocker', 'follow-up']);
  });

  it('escalates explicit out-of-scope findings', () => {
    expect(
      classifyFinding({ accepted: true, outOfScope: true }, baseScope)
    ).toBe('stop-and-escalate');
  });

  it('requires explicit approval beyond 2x original files or non-test LOC', () => {
    expect(
      scopeExpansion({ ...baseScope, currentFiles: 9 }).requiresApproval
    ).toBe(true);
    expect(
      classifyFinding(
        { accepted: true, blocker: true },
        { ...baseScope, currentFiles: 9 }
      )
    ).toBe('stop-and-escalate');
    expect(
      classifyFinding(
        { accepted: true, blocker: true },
        { ...baseScope, currentNonTestLoc: 201, approval: 'scope-approved' }
      )
    ).toBe('in-scope blocker');
  });

  it('pauses after two non-converged review-triggered fix cycles', () => {
    expect(
      shouldPauseForReclassification({
        ...baseScope,
        reviewTriggeredFixCycles: 2,
        converged: false,
      })
    ).toBe(true);
    expect(
      scopeDecision({
        ...baseScope,
        reviewTriggeredFixCycles: 2,
        converged: false,
      }).action
    ).toBe('pause-and-reclassify');
    expect(
      classifyFinding(
        { accepted: true, blocker: true },
        { ...baseScope, reviewTriggeredFixCycles: 2 }
      )
    ).toBe('stop-and-escalate');
  });
});

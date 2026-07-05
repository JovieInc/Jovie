import { describe, expect, it } from 'vitest';
import {
  AGENT_BRANCH_RE,
  extractTerminalFailures,
  isAgentBranch,
  isTerminalFailure,
  normalizeCheckName,
} from '../pr-check-failures.mjs';

describe('pr-check-failures', () => {
  it('treats bucket=fail as terminal like drain-pr-queue.sh', () => {
    expect(
      isTerminalFailure({ bucket: 'fail', state: 'SUCCESS', name: 'PR Ready' })
    ).toBe(true);
    expect(
      isTerminalFailure({ bucket: 'pass', state: 'FAILURE', name: 'Typecheck' })
    ).toBe(true);
    expect(
      isTerminalFailure({ bucket: 'pending', state: 'QUEUED', name: 'Build' })
    ).toBe(false);
  });

  it('normalizes check names from workflow/description fallbacks', () => {
    expect(normalizeCheckName({ workflow: 'Guardrails (proxy)' })).toBe(
      'Guardrails (proxy)'
    );
    expect(
      extractTerminalFailures([
        {
          bucket: 'fail',
          workflow: 'Guardrails (proxy)',
          description: 'version-stamp',
        },
      ])
    ).toEqual(['Guardrails (proxy)']);
  });

  it('filters advisory checks', () => {
    expect(
      extractTerminalFailures([
        { bucket: 'fail', name: 'Preview Deploy (PR)' },
        { bucket: 'fail', name: 'Typecheck' },
      ])
    ).toEqual(['Typecheck']);
  });

  it('recognizes agent branches used by drain AGENT_RE', () => {
    expect(isAgentBranch('codex/gh-12734-fix')).toBe(true);
    expect(isAgentBranch('tim/jov-1234')).toBe(true);
    expect(isAgentBranch('agent/wave-1')).toBe(true);
    expect(isAgentBranch('gtmq_spec_abc')).toBe(false);
    expect(isAgentBranch('feature/user-auth')).toBe(false);
    expect(AGENT_BRANCH_RE.test('feat/onboarding')).toBe(true);
  });

  it('marks checks systemic at the shared-failure threshold', () => {
    const failCountByCheck = {
      'Guardrails (proxy)': 5,
      Typecheck: 2,
    };
    const systemicChecks = Object.entries(failCountByCheck)
      .filter(([, count]) => count >= 3)
      .map(([check, count]) => ({ check, count }));
    expect(systemicChecks).toEqual([{ check: 'Guardrails (proxy)', count: 5 }]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  evaluateCiBranching,
  isAgentBranch,
  isExemptFromIntegrationTarget,
  suggestIntegrationBranch,
} from '../ci-branching-guard.mjs';

describe('ci-branching-guard', () => {
  it('detects agent branches', () => {
    expect(isAgentBranch('tim/jov-2934')).toBe(true);
    expect(isAgentBranch('linear/jov-1234')).toBe(true);
    expect(isAgentBranch('feature/foo')).toBe(false);
  });

  it('allows hotfix and needs-human exemptions', () => {
    expect(
      isExemptFromIntegrationTarget({
        headRef: 'hotfix/jov-9999',
        labels: [],
      })
    ).toBe(true);
    expect(
      isExemptFromIntegrationTarget({
        headRef: 'tim/jov-2934',
        labels: ['needs-human'],
      })
    ).toBe(true);
  });

  it('warns when agent branch targets main', () => {
    const result = evaluateCiBranching({
      baseRef: 'main',
      headRef: 'tim/jov-library-2934',
      labels: [],
      mode: 'warn',
    });
    expect(result.ok).toBe(true);
    expect(result.level).toBe('warn');
    expect(result.recommended).toBe('integration/loop-library');
  });

  it('errors when agent branch targets main in error mode', () => {
    const result = evaluateCiBranching({
      baseRef: 'main',
      headRef: 'tim/jov-clerk-2771',
      labels: [],
      mode: 'error',
    });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('error');
    expect(suggestIntegrationBranch('tim/jov-clerk-2771')).toBe(
      'integration/loop-auth'
    );
  });

  it('passes integration-targeted agent work', () => {
    const result = evaluateCiBranching({
      baseRef: 'integration/loop-library',
      headRef: 'tim/jov-2936',
      labels: [],
      mode: 'error',
    });
    expect(result.ok).toBe(true);
    expect(result.level).toBe('pass');
  });
});

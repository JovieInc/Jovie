import { describe, expect, it } from 'vitest';
import {
  ciFastTrustedBaseCandidates,
  resolveCiFastTrustedBase,
} from '../ci-fast-trusted-base.mjs';

/** Merge-group parent (github.event.merge_group.base_sha via TURBO_SCM_BASE). */
const MERGE_GROUP_PARENT = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('ci-fast trusted base (SYM-3 / JOV-12617)', () => {
  it('prefers the merge-group parent commit over origin/main during merge_group', () => {
    const env = {
      GITHUB_EVENT_NAME: 'merge_group',
      GITHUB_BASE_REF: 'main',
      TURBO_SCM_BASE: MERGE_GROUP_PARENT,
    };

    expect(ciFastTrustedBaseCandidates(env)).toEqual([
      MERGE_GROUP_PARENT,
      'origin/main',
    ]);

    const resolved = resolveCiFastTrustedBase({
      env,
      refExists: ref => ref === 'origin/main' || ref === MERGE_GROUP_PARENT,
    });
    expect(resolved).toEqual({ ok: true, ref: MERGE_GROUP_PARENT });
  });

  it('keeps origin/<base> first for pull_request (PR head vs target branch)', () => {
    const env = {
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_BASE_REF: 'main',
      TURBO_SCM_BASE: MERGE_GROUP_PARENT,
    };

    expect(ciFastTrustedBaseCandidates(env)[0]).toBe('origin/main');
    expect(
      resolveCiFastTrustedBase({
        env,
        refExists: ref => ref === 'origin/main' || ref === MERGE_GROUP_PARENT,
      })
    ).toEqual({ ok: true, ref: 'origin/main' });
  });

  it('falls back to origin/main on merge_group when TURBO_SCM_BASE is missing', () => {
    const env = {
      GITHUB_EVENT_NAME: 'merge_group',
      GITHUB_BASE_REF: 'main',
    };
    expect(ciFastTrustedBaseCandidates(env)).toEqual(['origin/main']);
    expect(
      resolveCiFastTrustedBase({
        env,
        refExists: ref => ref === 'origin/main',
      })
    ).toEqual({ ok: true, ref: 'origin/main' });
  });
});

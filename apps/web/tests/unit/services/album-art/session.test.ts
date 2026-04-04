import { describe, expect, it } from 'vitest';
import { assertSessionCanApplyToRelease } from '@/lib/services/album-art/session';

describe('assertSessionCanApplyToRelease', () => {
  it('allows draft-backed sessions to be applied to a release', () => {
    expect(() =>
      assertSessionCanApplyToRelease({
        sessionReleaseId: null,
        targetReleaseId: 'release-1',
      })
    ).not.toThrow();
  });

  it('allows applying a session to its original release', () => {
    expect(() =>
      assertSessionCanApplyToRelease({
        sessionReleaseId: 'release-1',
        targetReleaseId: 'release-1',
      })
    ).not.toThrow();
  });

  it('rejects applying a session to a different release', () => {
    expect(() =>
      assertSessionCanApplyToRelease({
        sessionReleaseId: 'release-1',
        targetReleaseId: 'release-2',
      })
    ).toThrow('Album art session does not belong to this release');
  });
});

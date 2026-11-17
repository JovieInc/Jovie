import { describe, expect, it } from 'vitest';

import { releasePrEligibleForWriterProof } from '../../attach-changelog-writer-proof.mjs';

const HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'b'.repeat(40);
const PR_NUMBER = 24442;
const WRITER = 'jovie-bot[bot]';

const base = {
  prNumber: PR_NUMBER,
  headSha: HEAD,
  authorLogin: WRITER,
  body: '<!-- customer-changelog/v1 {"releaseWorthy":false} -->',
  branch: 'release/daily-changelog-2026-11-01-run-1',
};

describe('writer-proof head guard (JOV-10216 follow-up)', () => {
  it('refuses to attach a receipt bound to a head that already moved', () => {
    expect(
      releasePrEligibleForWriterProof({ ...base, actualHeadSha: OTHER_HEAD })
    ).toMatchObject({ eligible: false, reason: 'head-mismatch' });
  });

  it('attaches when the requested head matches the live PR head', () => {
    expect(
      releasePrEligibleForWriterProof({ ...base, actualHeadSha: HEAD })
    ).toMatchObject({ eligible: true, reason: 'release-pr-shape' });
  });

  it('still attaches when the live head was not read (trusted transport)', () => {
    expect(releasePrEligibleForWriterProof(base)).toMatchObject({
      eligible: true,
      reason: 'release-pr-shape',
    });
  });
});

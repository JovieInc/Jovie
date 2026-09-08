import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { deriveThumbnailCandidateReviewIds } from './thumbnail-review';

describe('thumbnail candidate review identity', () => {
  it('uses stable database ids so a failed two-write sequence is retryable', () => {
    const input = {
      userId: '00000000-0000-4000-8000-000000000001',
      videoPk: '00000000-0000-4000-8000-000000000002',
      artifactSha256:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    };

    const first = deriveThumbnailCandidateReviewIds(input);
    expect(deriveThumbnailCandidateReviewIds(input)).toEqual(first);
    expect(first.thumbnailVersionId).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
    );
    expect(first.reviewActionId).not.toBe(first.thumbnailVersionId);
  });

  it('does not alias different image artifacts', () => {
    const base = {
      userId: '00000000-0000-4000-8000-000000000001',
      videoPk: '00000000-0000-4000-8000-000000000002',
    };
    expect(
      deriveThumbnailCandidateReviewIds({
        ...base,
        artifactSha256: 'a'.repeat(64),
      })
    ).not.toEqual(
      deriveThumbnailCandidateReviewIds({
        ...base,
        artifactSha256: 'b'.repeat(64),
      })
    );
  });
});

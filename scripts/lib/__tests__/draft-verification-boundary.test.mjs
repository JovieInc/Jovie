import { describe, expect, it } from 'vitest';
import {
  evaluateVerificationBoundary,
  PUBLICATION_GATES,
  REMOTE_DRAFT_GATES,
} from '../draft-verification-boundary.mjs';

const success = names =>
  Object.fromEntries(names.map(name => [name, 'success']));

describe('thin publication and broad remote verification', () => {
  it('deliberate red: a local affected failure cannot deadlock publication', () => {
    const result = evaluateVerificationBoundary({
      localEvidence: {
        ...success(PUBLICATION_GATES),
        affectedTests: 'failure',
        typecheck: 'failure',
        lint: 'failure',
        coverage: 'failure',
      },
      remoteEvidence: {
        ...success(REMOTE_DRAFT_GATES),
        affectedTests: 'failure',
      },
      publishedHead: 'a'.repeat(40),
      liveHead: 'a'.repeat(40),
    });

    expect(result.publicationGreen).toBe(true);
    expect(result.draftCiGreen).toBe(false);
    expect(result.promotionGreen).toBe(false);
  });

  it('requires every broad remote gate on the live exact head', () => {
    expect(
      evaluateVerificationBoundary({
        localEvidence: success(PUBLICATION_GATES),
        remoteEvidence: success(REMOTE_DRAFT_GATES),
        publishedHead: 'a'.repeat(40),
        liveHead: 'b'.repeat(40),
      }).promotionGreen
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  REVIEW_INBOX_DECISION_CONTRACT,
  REVIEW_INBOX_PILOT_TENANT,
} from './contract';
import { gateReviewDecision, validateReviewDecisionBody } from './gates';
import { createPilotReviewCase, PILOT_V1_DIGEST } from './pilot-fixture';

describe('review inbox gates', () => {
  it('rejects invalid bodies and enforces pin digest binding', () => {
    expect(validateReviewDecisionBody(null)).toBeNull();
    const body = {
      contract: REVIEW_INBOX_DECISION_CONTRACT,
      tenant: REVIEW_INBOX_PILOT_TENANT,
      caseId: REVIEW_INBOX_PILOT_TENANT,
      revision: 'v1',
      command: 'request_changes' as const,
      actionId: 'a1',
      pins: [
        {
          id: 'p1',
          assetDigest: 'bad-digest',
          revision: 'v1',
          x: 0.1,
          y: 0.2,
          note: 'nope',
        },
      ],
    };
    const gate = gateReviewDecision(createPilotReviewCase(), body, new Set());
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.error).toBe('invalid_pin');
  });

  it('accepts a valid request_changes with pins on v1', () => {
    const body = {
      contract: REVIEW_INBOX_DECISION_CONTRACT,
      tenant: REVIEW_INBOX_PILOT_TENANT,
      caseId: REVIEW_INBOX_PILOT_TENANT,
      revision: 'v1',
      command: 'request_changes' as const,
      actionId: 'a2',
      pins: [
        {
          id: 'p1',
          assetDigest: PILOT_V1_DIGEST,
          revision: 'v1',
          x: 0.5,
          y: 0.5,
          note: 'Crop',
        },
      ],
    };
    expect(
      gateReviewDecision(createPilotReviewCase(), body, new Set()).ok
    ).toBe(true);
  });
});

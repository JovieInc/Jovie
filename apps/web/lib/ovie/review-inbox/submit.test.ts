import { describe, expect, it } from 'vitest';
import { REVIEW_INBOX_PILOT_TENANT } from './contract';
import {
  parseReviewInboxSubmit,
  submitToReviewInboxDecisionStub,
} from './submit';

describe('review inbox submit adapter', () => {
  it('parses push/content-engine submit envelopes', () => {
    const submit = parseReviewInboxSubmit({
      contract: 'jovie.review-inbox-submit/v1',
      tenant: REVIEW_INBOX_PILOT_TENANT,
      source: { system: 'content-engine', id: 'asset-1' },
      title: 'Hero still',
      revision: 'v1',
    });
    expect(submit).not.toBeNull();
    const stub = submitToReviewInboxDecisionStub(submit!, 'action-1');
    expect(stub?.command).toBe('favorite');
  });
});

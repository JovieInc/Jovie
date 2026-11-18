import { describe, expect, it } from 'vitest';
import { outboundFixtureRow } from './outbound-fixtures';
import { outboundMessageEmptyReason } from './outbound-message-state';

describe('blocked outbound draft explanation', () => {
  it.each(['Existing relationship: flag to Tim, no cold outreach', ''])(
    'preserves the relationship hold value %j ahead of other blockers',
    relationshipHold => {
      expect(
        outboundMessageEmptyReason(
          outboundFixtureRow({
            relationshipHold,
            view: 'needs_judge',
            flags: ['cold_draft_unavailable'],
          })
        )
      ).toBe(relationshipHold);
    }
  );
});

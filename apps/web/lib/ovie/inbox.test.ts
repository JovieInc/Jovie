import { describe, expect, it } from 'vitest';
import { designProposal, summerCard } from '@/tests/fixtures/ovie-inbox';
import {
  buildInboxDecisionRequest,
  decisionFromSwipe,
  inboxItemFromDesignProposal,
  inboxItemFromSummerCard,
  OVIE_INBOX_SWIPE_THRESHOLD_PX,
  sortInboxItems,
} from './inbox';

describe('Ovie inbox model', () => {
  it('keeps every Summer card field the founder decides on', () => {
    const item = inboxItemFromSummerCard(summerCard());
    expect(item).toMatchObject({
      key: 'summer:sc_00000000000000000000000000000001',
      kind: 'spend',
      recommendation: 'Approve the renewal.',
      defaultIfSilent: 'Seats lapse on Friday.',
      recipient: 'Linear',
      amountUsd: 16,
      evidence: ['https://linear.app/billing'],
      rejectRequiresComment: false,
    });
  });

  it('maps a Design Lab proposal to a taste card with its still and Linear link', () => {
    const item = inboxItemFromDesignProposal(designProposal());
    expect(item).toMatchObject({
      key: 'design-lab:proposal-1',
      kind: 'taste',
      title: 'Profile Hero',
      imageUrl: 'https://cdn.example.com/still.png',
      evidence: [
        'https://cdn.example.com/still.png',
        'https://linear.app/jovie/issue/JOV-1',
      ],
      rejectRequiresComment: true,
    });
  });

  it('sorts newest first', () => {
    const older = inboxItemFromSummerCard(summerCard());
    const newer = inboxItemFromDesignProposal(designProposal());
    expect(sortInboxItems([older, newer]).map(item => item.key)).toEqual([
      newer.key,
      older.key,
    ]);
  });

  it('commits a swipe only past the threshold', () => {
    expect(decisionFromSwipe(OVIE_INBOX_SWIPE_THRESHOLD_PX)).toBe('approve');
    expect(decisionFromSwipe(-OVIE_INBOX_SWIPE_THRESHOLD_PX)).toBe('reject');
    expect(decisionFromSwipe(OVIE_INBOX_SWIPE_THRESHOLD_PX - 1)).toBeNull();
  });

  describe('buildInboxDecisionRequest', () => {
    it('posts Summer decisions to the card endpoint, comment optional', () => {
      const item = inboxItemFromSummerCard(summerCard());
      expect(buildInboxDecisionRequest(item, 'reject', null)).toEqual({
        url: '/api/ovie/summer-cards/sc_00000000000000000000000000000001/decision',
        body: { decision: 'reject' },
      });
      expect(
        buildInboxDecisionRequest(item, 'approve', '  ship it ')?.body
      ).toEqual({ decision: 'approve', comment: 'ship it' });
    });

    it('maps taste decisions to the Design Lab review contract', () => {
      const item = inboxItemFromDesignProposal(designProposal());
      expect(buildInboxDecisionRequest(item, 'approve', null)?.body).toEqual({
        dayBucket: '2026-09-26',
        decision: 'yes',
        notes: null,
      });
      expect(
        buildInboxDecisionRequest(item, 'approve', 'less air')?.body
      ).toMatchObject({ decision: 'yes-with-notes', notes: 'less air' });
      expect(
        buildInboxDecisionRequest(item, 'reject', 'too loud')?.body
      ).toMatchObject({ decision: 'no', notes: 'too loud' });
    });

    it('refuses a taste reject without direction, and a proposal without a day', () => {
      const item = inboxItemFromDesignProposal(designProposal());
      expect(buildInboxDecisionRequest(item, 'reject', '   ')).toBeNull();
      const undated = inboxItemFromDesignProposal(
        designProposal({ dayBucket: null })
      );
      expect(buildInboxDecisionRequest(undated, 'approve', null)).toBeNull();
    });
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { MERCH_MOCKUP_FAILURE_PUBLISH_BLOCKER } from './generation-contract';
import {
  CARD_ID,
  CLERK_USER_ID,
  dbHarness,
  GENERATION_ID,
  generation,
  makeCard,
  makeOption,
  OPTION_ID,
  OTHER_OPTION_ID,
  PROFILE_ID,
  profile,
  queuePostClaimWrites,
} from './service.test-setup';

const {
  publishMerchCard,
  selectMerchDesign,
  updateMerchCardDetails,
  updateMerchCardStatus,
} = await import('./service');

describe('merch mockup publish eligibility', () => {
  beforeEach(() => {
    dbHarness.reset();
  });

  /**
   * Queue the pending-option select flow. Card echoes are queued for BOTH the
   * pre-fix and post-fix shapes: pre-fix, publish:true reaches the
   * set-status-live update (consuming the second echo); post-fix the card
   * stays a draft and the extra echo is left unconsumed.
   */
  function queuePendingSelectFlow(qualityReview: Record<string, unknown>) {
    const pendingOption = makeOption({ qualityReview });
    dbHarness.queue([pendingOption]); // option lookup
    dbHarness.queue([generation]); // generation batch
    dbHarness.queue([]); // existing card check
    dbHarness.queue([profile]); // creator profile
    dbHarness.queue([{ id: OTHER_OPTION_ID }]); // rejected siblings
    dbHarness.queue([makeCard()]); // insert().returning() -> won the claim
    dbHarness.queue([makeCard()]); // absorbed by the live-status update pre-fix
    queuePostClaimWrites();
  }

  it.each(['pending_mockup', 'mockup_failed'] as const)(
    'select with publish:true keeps a %s option a draft (persisted status, not later corrected)',
    async mockupStatus => {
      queuePendingSelectFlow({ mockupStatus });

      const result = await selectMerchDesign({
        generationId: GENERATION_ID,
        clerkUserId: CLERK_USER_ID,
        optionId: OPTION_ID,
        publish: true,
      });

      // The persisted insert itself must be a draft — this is the row that
      // was written, not a post-hoc correction of the in-memory result.
      expect(dbHarness.methodArgs('values')).toMatchObject([
        { status: 'draft' },
      ]);
      // No live-status write anywhere in the flow.
      for (const setArg of dbHarness.methodArgs('set')) {
        expect((setArg as { status?: string }).status).not.toBe('live');
      }
      const contract = await import('./generation-contract');
      const expectedBlocker =
        mockupStatus === 'pending_mockup'
          ? contract.MERCH_MOCKUP_PENDING_PUBLISH_BLOCKER
          : MERCH_MOCKUP_FAILURE_PUBLISH_BLOCKER;
      expect(result.product?.publishEligible).toBe(false);
      expect(result.publishBlockedReasons).toContain(expectedBlocker);
      expect(result.status).toBe('draft');
    }
  );

  it('selects a pending_mockup option as a draft when publish is not requested', async () => {
    queuePendingSelectFlow({ mockupStatus: 'pending_mockup' });

    const result = await selectMerchDesign({
      generationId: GENERATION_ID,
      clerkUserId: CLERK_USER_ID,
      optionId: OPTION_ID,
    });

    expect(result.success).toBe(true);
    expect(dbHarness.methodArgs('values')).toMatchObject([{ status: 'draft' }]);
    expect(result.status).toBe('draft');
  });

  it.each(['pending_mockup', 'mockup_failed'] as const)(
    'publishMerchCard refuses a card whose selected option is %s',
    async mockupStatus => {
      dbHarness.queue([makeCard()]); // card lookup
      dbHarness.queue([{ qualityReview: { mockupStatus } }]); // option quality review
      dbHarness.queue([makeCard({ status: 'live' })]); // update echo, never reached post-fix

      await expect(
        publishMerchCard({
          cardId: CARD_ID,
          profileId: PROFILE_ID,
          clerkUserId: CLERK_USER_ID,
        })
      ).rejects.toThrow('cannot be published');
      // The refusal happens before any write: no update .set() may occur.
      expect(dbHarness.methodArgs('set')).toEqual([]);
    }
  );

  it('publishes a legacy card whose option carries no mockup lifecycle stamp', async () => {
    dbHarness.queue([makeCard()]); // card lookup
    dbHarness.queue([{ qualityReview: {} }]); // option quality review: no stamp
    dbHarness.queue([makeCard({ status: 'live' })]); // update echo
    dbHarness.queue([{ usernameNormalized: 'timwhite' }]); // profile read for revalidate

    const card = await publishMerchCard({
      cardId: CARD_ID,
      profileId: PROFILE_ID,
      clerkUserId: CLERK_USER_ID,
    });

    expect(card.status).toBe('live');
    expect(dbHarness.methodArgs('set')).toMatchObject([{ status: 'live' }]);
  });

  it.each(['pending_mockup', 'mockup_failed'] as const)(
    'updateMerchCardStatus to live refuses a card whose selected option is %s',
    async mockupStatus => {
      dbHarness.queue([makeCard()]); // card lookup
      dbHarness.queue([{ qualityReview: { mockupStatus } }]); // option quality review

      await expect(
        updateMerchCardStatus({
          cardId: CARD_ID,
          profileId: PROFILE_ID,
          clerkUserId: CLERK_USER_ID,
          status: 'live',
        })
      ).rejects.toThrow('cannot be published');
      expect(dbHarness.methodArgs('set')).toEqual([]);
    }
  );

  it('updateMerchCardDetails makeLive refuses a pending_mockup option', async () => {
    dbHarness.queue([makeCard()]); // card lookup
    dbHarness.queue([{ qualityReview: { mockupStatus: 'pending_mockup' } }]); // option quality review

    await expect(
      updateMerchCardDetails({
        cardId: CARD_ID,
        profileId: PROFILE_ID,
        clerkUserId: CLERK_USER_ID,
        makeLive: true,
      })
    ).rejects.toThrow('cannot be published');
    expect(dbHarness.methodArgs('set')).toEqual([]);
  });
});

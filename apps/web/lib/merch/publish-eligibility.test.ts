import { describe, expect, it } from 'vitest';
import { MERCH_MOCKUP_FAILURE_PUBLISH_BLOCKER } from './generation-contract';

/**
 * Publish-eligibility gate for the truthful-mockup lifecycle (JOV-4743): a
 * merch option may only go live once its real Printful mockup is attached.
 * `pending_mockup` and `mockup_failed` cannot be published; legacy rows
 * generated before the contract carry no lifecycle stamp and keep their
 * historical (publishable) behavior.
 *
 * The eligibility rule itself is imported dynamically so the red state of
 * this suite is the missing rule, not a module-load failure.
 */
describe('merch mockup publish eligibility', () => {
  it('blocks a pending_mockup option from publishing', async () => {
    const safety = await import('./safety');
    const contract = await import('./generation-contract');
    const review = { mockupStatus: 'pending_mockup' };

    expect(safety.isMerchMockupPublishable(review)).toBe(false);
    expect(safety.getMerchMockupPublishBlocker(review)).toBe(
      contract.MERCH_MOCKUP_PENDING_PUBLISH_BLOCKER
    );
  });

  it('blocks a mockup_failed option from publishing', async () => {
    const { isMerchMockupPublishable, getMerchMockupPublishBlocker } =
      await import('./safety');
    const review = { mockupStatus: 'mockup_failed' };

    expect(isMerchMockupPublishable(review)).toBe(false);
    expect(getMerchMockupPublishBlocker(review)).toBe(
      MERCH_MOCKUP_FAILURE_PUBLISH_BLOCKER
    );
  });

  it('publishes a mockup_ready option', async () => {
    const { isMerchMockupPublishable, getMerchMockupPublishBlocker } =
      await import('./safety');

    expect(isMerchMockupPublishable({ mockupStatus: 'mockup_ready' })).toBe(
      true
    );
    expect(getMerchMockupPublishBlocker({ mockupStatus: 'mockup_ready' })).toBe(
      null
    );
  });

  it('keeps legacy rows without a lifecycle stamp publishable', async () => {
    const { isMerchMockupPublishable, getMerchMockupPublishBlocker } =
      await import('./safety');

    expect(isMerchMockupPublishable({})).toBe(true);
    expect(isMerchMockupPublishable(null)).toBe(true);
    expect(isMerchMockupPublishable(undefined)).toBe(true);
    expect(getMerchMockupPublishBlocker({})).toBe(null);
    expect(getMerchMockupPublishBlocker(null)).toBe(null);
    expect(getMerchMockupPublishBlocker(undefined)).toBe(null);
  });
});

import { describe, expect, it } from 'vitest';

import {
  isMerchGenerationRecoveryReceiptText,
  isNonActionableMerchGenerationRecoveryEvent,
  MERCH_GENERATION_RECOVERY_IGNORE_ERRORS,
} from './merch-recovery-receipt';

const RECEIPT_MESSAGE =
  '[merch-generation-recovery] reconciled stale merch generation work';
// captureWarning wraps the message in new Error(...), so the Sentry/Linear
// title carries the exception-type prefix regardless of the event's
// warning level (JOV-12562 / Sentry 7847611605).
const RECEIPT_TITLE = `Error: ${RECEIPT_MESSAGE}`;

describe('merch generation recovery receipt filter (JOV-12581)', () => {
  it('matches the real prod title, message, and ignoreErrors pattern', () => {
    expect(isMerchGenerationRecoveryReceiptText(RECEIPT_TITLE)).toBe(true);
    expect(isMerchGenerationRecoveryReceiptText(RECEIPT_MESSAGE)).toBe(true);
    expect(
      MERCH_GENERATION_RECOVERY_IGNORE_ERRORS.some(pattern =>
        pattern.test(RECEIPT_TITLE)
      )
    ).toBe(true);
  });

  it('matches a Sentry event via exception value, extra.message, or logentry', () => {
    expect(
      isNonActionableMerchGenerationRecoveryEvent({
        exception: {
          values: [{ type: 'Error', value: RECEIPT_MESSAGE }],
        },
      })
    ).toBe(true);
    expect(
      isNonActionableMerchGenerationRecoveryEvent({
        extra: { message: RECEIPT_MESSAGE },
      })
    ).toBe(true);
    expect(
      isNonActionableMerchGenerationRecoveryEvent({
        logentry: { formatted: RECEIPT_TITLE },
      })
    ).toBe(true);
  });

  it('never matches real reconciler failures or unrelated events', () => {
    expect(
      isMerchGenerationRecoveryReceiptText(
        'Error: Failed query: update merch_generation_batches'
      )
    ).toBe(false);
    expect(
      isMerchGenerationRecoveryReceiptText(
        '[merch-generation-recovery] reconciliation failed'
      )
    ).toBe(false);
    expect(isMerchGenerationRecoveryReceiptText('')).toBe(false);
    expect(isMerchGenerationRecoveryReceiptText(null)).toBe(false);
    expect(
      isNonActionableMerchGenerationRecoveryEvent({
        exception: { values: [{ value: 'Unauthorized' }] },
      })
    ).toBe(false);
  });
});

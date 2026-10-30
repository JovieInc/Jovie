import { describe, expect, it } from 'vitest';
import {
  isInternalOrTestAccountEmail,
  normalizeEmail,
} from '@/lib/utils/email';
import {
  CHATGPT_REVIEW_ACCOUNT_EMAIL,
  isChatGPTReviewAccountEmail,
} from './platform-review-identities';
import {
  isProdcertCanaryEmail,
  PRODCERT_RETURNING_CANARY_EMAIL,
} from './prodcert-identities';

describe('platform review account identity', () => {
  it('is classified internal so listing reviews never reach customer metrics', () => {
    expect(isInternalOrTestAccountEmail(CHATGPT_REVIEW_ACCOUNT_EMAIL)).toBe(
      true
    );
  });

  it('matches only its own normalized address', () => {
    expect(isChatGPTReviewAccountEmail(CHATGPT_REVIEW_ACCOUNT_EMAIL)).toBe(
      true
    );
    expect(
      isChatGPTReviewAccountEmail(` ${CHATGPT_REVIEW_ACCOUNT_EMAIL} `)
    ).toBe(true);
    expect(isChatGPTReviewAccountEmail(null)).toBe(false);
    expect(isChatGPTReviewAccountEmail('')).toBe(false);
    expect(isChatGPTReviewAccountEmail('chatgpt-review@jov.ie')).toBe(false);
    expect(
      isChatGPTReviewAccountEmail('chatgpt-review+clerk_test@example.com')
    ).toBe(false);
  });

  it('is not a production certification canary', () => {
    expect(isProdcertCanaryEmail(CHATGPT_REVIEW_ACCOUNT_EMAIL)).toBe(false);
    expect(CHATGPT_REVIEW_ACCOUNT_EMAIL).not.toBe(
      PRODCERT_RETURNING_CANARY_EMAIL
    );
  });

  it('normalizes to the same address the classifier sees', () => {
    expect(normalizeEmail(CHATGPT_REVIEW_ACCOUNT_EMAIL)).toBe(
      CHATGPT_REVIEW_ACCOUNT_EMAIL
    );
  });
});

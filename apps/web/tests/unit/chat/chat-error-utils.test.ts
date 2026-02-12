import { describe, expect, it } from 'vitest';

import {
  getUpgradePromptMessage,
  parseChatErrorPayload,
  shouldShowUpgradeMessage,
} from '@/components/jovie/utils';

describe('parseChatErrorPayload', () => {
  it('parses structured JSON payload fields', () => {
    const payload = {
      message:
        'You have reached your daily AI message limit. Upgrade to Pro for 100 messages per day.',
      retryAfter: 3600,
      code: 'RATE_LIMITED',
    };

    const parsed = parseChatErrorPayload(new Error(JSON.stringify(payload)));

    expect(parsed).toEqual({
      message: payload.message,
      retryAfter: payload.retryAfter,
      errorCode: payload.code,
    });
  });

  it('falls back to bracketed error code extraction for plain-text errors', () => {
    const parsed = parseChatErrorPayload(
      new Error('Request failed with status 429 [RATE_LIMITED]')
    );

    expect(parsed.message).toBeUndefined();
    expect(parsed.retryAfter).toBeUndefined();
    expect(parsed.errorCode).toBe('RATE_LIMITED');
  });
});

describe('shouldShowUpgradeMessage', () => {
  it('returns true for rate-limit daily quota exhaustion messages', () => {
    expect(
      shouldShowUpgradeMessage(
        'rate_limit',
        'You have reached your daily AI message limit. Upgrade to Pro for 100 messages per day.'
      )
    ).toBe(true);
  });

  it('returns false for short-window throttling messages', () => {
    expect(
      shouldShowUpgradeMessage(
        'rate_limit',
        'Too many messages in a short time. Please wait a moment.'
      )
    ).toBe(false);
  });

  it('returns false for non-rate-limit errors even with upgrade language', () => {
    expect(
      shouldShowUpgradeMessage('server', 'Upgrade required for this action')
    ).toBe(false);
  });
});

describe('getUpgradePromptMessage', () => {
  it('includes the pricing upgrade link', () => {
    expect(getUpgradePromptMessage()).toContain('https://jovie.fm/pricing');
  });
});

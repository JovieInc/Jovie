import { describe, expect, it } from 'vitest';
import { getOnboardingErrorMessage } from '@/components/features/onboarding/onboardingChatHelpers';
import {
  extractErrorMetadata,
  getErrorType,
  getPreferredErrorMessage,
} from '@/components/jovie/utils';

function serializeApiError(
  status: number,
  body: Record<string, unknown>
): {
  errorCode?: string;
  message: string;
  type: ReturnType<typeof getErrorType>;
} {
  const error = Object.assign(new Error(JSON.stringify(body)), { status });
  const type = getErrorType(error);
  const metadata = extractErrorMetadata(error);
  return {
    errorCode: metadata.errorCode,
    message: getPreferredErrorMessage(error, type, metadata),
    type,
  };
}

describe('getOnboardingErrorMessage', () => {
  it.each([
    {
      status: 403,
      body: {
        error: 'Bot challenge failed',
        errorCode: 'TURNSTILE_REQUIRED',
      },
      expected: 'Complete the security check to send your message.',
    },
    {
      status: 429,
      body: {
        error: 'Rate limit exceeded',
        message: 'IP limit exceeded',
        errorCode: 'RATE_LIMITED',
      },
      expected: 'Too many messages were sent. Try again in a moment.',
    },
    {
      status: 401,
      body: {
        error: 'Unauthorized',
        errorCode: 'AUTH_REQUIRED',
        requestId: '21f5b81f-31bb-4e48-98d0-85d160954836',
      },
      expected: 'Sign in to continue this chat.',
    },
    {
      status: 503,
      body: {
        error: 'Onboarding chat is temporarily unavailable',
        errorCode: 'TURNSTILE_NOT_CONFIGURED',
      },
      expected: 'Chat is temporarily unavailable. Try again in a moment.',
    },
    {
      status: 503,
      body: {
        error: 'Onboarding chat is temporarily unavailable',
        errorCode: 'ONBOARDING_CHAT_PERSISTENCE_FAILED',
      },
      expected: 'Chat is temporarily unavailable. Try again in a moment.',
    },
    {
      status: 500,
      body: {
        error: 'Onboarding chat failed',
        errorCode: 'INTERNAL_ERROR',
      },
      expected: 'Chat is temporarily unavailable. Try again in a moment.',
    },
  ])('maps a $status API response without leaking its body', ({
    status,
    body,
    expected,
  }) => {
    const serialized = serializeApiError(status, body);

    expect(
      getOnboardingErrorMessage(
        serialized.message,
        serialized.errorCode,
        serialized.type
      )
    ).toBe(expected);
  });

  it('does not render a 401 Unauthorized transport body as a rate limit', () => {
    const serialized = serializeApiError(401, {
      error: 'Unauthorized',
      requestId: '21f5b81f-31bb-4e48-98d0-85d160954836',
    });

    expect(serialized.type).not.toBe('rate_limit');
    expect(
      getOnboardingErrorMessage(
        serialized.message,
        serialized.errorCode,
        serialized.type
      )
    ).toBe('Sign in to continue this chat.');
  });

  it('uses calm fallback copy for arbitrary plain-text errors', () => {
    expect(
      getOnboardingErrorMessage(
        'upstream socket exploded with tenant 123',
        undefined,
        'unknown'
      )
    ).toBe('Jovie could not send your message. Try again.');
  });
});

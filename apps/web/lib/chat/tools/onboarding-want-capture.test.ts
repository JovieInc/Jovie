import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WANT_NOT_AVAILABLE } from './onboarding-signals';
import {
  captureOnboardingWant,
  ONBOARDING_WANT_MAX_LENGTH,
} from './onboarding-want-capture';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  createFeedbackItem: vi.fn(),
  captureError: vi.fn(),
  existing: [] as Array<{ id: string }>,
}));
vi.mock('@/lib/db', () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => mocks.existing,
  };
  return { db: { select: () => chain } };
});
vi.mock('@/lib/db/schema/feedback', () => ({
  feedbackItems: {
    id: 'id',
    source: 'source',
    fingerprint: 'fp',
    context: 'ctx',
  },
}));
vi.mock('@/lib/feedback', () => ({
  createFeedbackItem: mocks.createFeedbackItem,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));

describe('captureOnboardingWant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existing = [];
    mocks.createFeedbackItem.mockResolvedValue({ id: 'feedback_1' });
    mocks.captureError.mockResolvedValue(undefined);
  });

  it('writes one onboarding_want build request for a not_available want', async () => {
    await captureOnboardingWant('session-1', {
      text: '  Sell paid fan memberships  ',
      capability: WANT_NOT_AVAILABLE,
    });

    expect(mocks.createFeedbackItem).toHaveBeenCalledTimes(1);
    expect(mocks.createFeedbackItem).toHaveBeenCalledWith({
      userId: null,
      source: 'onboarding_want',
      message: 'Sell paid fan memberships',
      context: expect.objectContaining({
        pathname: '/start',
        userAgent: null,
        onboardingSessionId: 'session-1',
        matchedCapability: WANT_NOT_AVAILABLE,
      }),
    });
  });

  it('does not log a want this session already logged', async () => {
    mocks.existing = [{ id: 'feedback_0' }];
    await captureOnboardingWant('session-1', {
      text: 'Sell paid fan memberships',
      capability: WANT_NOT_AVAILABLE,
    });
    expect(mocks.createFeedbackItem).not.toHaveBeenCalled();
  });

  it('caps the stored want text', async () => {
    await captureOnboardingWant('session-1', {
      text: 'x'.repeat(ONBOARDING_WANT_MAX_LENGTH + 50),
      capability: WANT_NOT_AVAILABLE,
    });
    const [[params]] = mocks.createFeedbackItem.mock.calls;
    expect(params.message).toHaveLength(ONBOARDING_WANT_MAX_LENGTH);
  });

  it('writes nothing for a want an available capability serves', async () => {
    await captureOnboardingWant('session-1', {
      text: 'One link for my single',
      capability: 'smart-links',
    });
    expect(mocks.createFeedbackItem).not.toHaveBeenCalled();
  });

  it('writes nothing without a want or with blank text', async () => {
    await captureOnboardingWant('session-1', undefined);
    await captureOnboardingWant('session-1', {
      text: '   ',
      capability: WANT_NOT_AVAILABLE,
    });
    expect(mocks.createFeedbackItem).not.toHaveBeenCalled();
  });

  it('reports a failed write instead of throwing', async () => {
    const failure = new Error('db down');
    mocks.createFeedbackItem.mockRejectedValue(failure);

    await expect(
      captureOnboardingWant('session-1', {
        text: 'Sell paid fan memberships',
        capability: WANT_NOT_AVAILABLE,
      })
    ).resolves.toBeUndefined();
    expect(mocks.captureError).toHaveBeenCalledWith(
      'Onboarding want build request not saved',
      failure,
      expect.objectContaining({ onboardingSessionId: 'session-1' })
    );
  });

  it('survives error tracking itself failing', async () => {
    mocks.createFeedbackItem.mockRejectedValue(new Error('db down'));
    mocks.captureError.mockRejectedValue(new Error('sentry down'));
    await expect(
      captureOnboardingWant('session-1', {
        text: 'Sell paid fan memberships',
        capability: WANT_NOT_AVAILABLE,
      })
    ).resolves.toBeUndefined();
  });
});

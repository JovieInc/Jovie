import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insertedValues: [] as unknown[][],
  updateSets: [] as unknown[],
  runAfterResponse: vi.fn(),
}));

vi.mock('@/lib/customer-voice/after-response', () => ({
  runAfterResponse: mocks.runAfterResponse,
}));

vi.mock('@/lib/db', () => {
  const returning = vi.fn().mockResolvedValue([{ id: 'feedback_want_1' }]);
  return {
    db: {
      insert: () => ({
        values: (v: unknown) => {
          mocks.insertedValues.push(Array.isArray(v) ? v : [v]);
          return { returning };
        },
      }),
      select: () => {
        throw new Error('feature requests never run the bug dedupe query');
      },
      update: () => ({
        set: (value: unknown) => {
          mocks.updateSets.push(value);
          return { where: () => ({ returning }) };
        },
      }),
    },
  };
});

describe('onboarding_want feedback source', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertedValues.length = 0;
    mocks.updateSets.length = 0;
  });

  it('enters the closed loop as a feature request and never pings the founder', async () => {
    const { createFeedbackItem } = await import('@/lib/feedback');
    const item = await createFeedbackItem({
      userId: null,
      source: 'onboarding_want',
      message: 'My link page is broken, I want paid fan memberships',
      context: {
        pathname: '/start',
        userAgent: null,
        timestampIso: new Date().toISOString(),
        onboardingSessionId: 'session-1',
        matchedCapability: 'not_available',
      },
    });

    expect(item).toEqual({ id: 'feedback_want_1' });
    const row = mocks.insertedValues[0]?.[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      userId: null,
      source: 'onboarding_want',
      classification: 'feature_or_change',
    });
    const decisions = mocks.insertedValues[1] as { decision: string }[];
    expect(decisions.map(d => d.decision)).toEqual([
      'classified',
      'summer_signal',
    ]);
    expect(mocks.updateSets[0]).toMatchObject({
      disposition: 'pending_summer',
    });
    expect(mocks.runAfterResponse).not.toHaveBeenCalled();
  });
});

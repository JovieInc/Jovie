import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReturning = vi.hoisted(() => vi.fn());
const mockValues = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
  },
}));

describe('createFeedbackItem', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockReturning.mockResolvedValue([{ id: 'feedback_1' }]);
    mockValues.mockReturnValue({ returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it('returns inserted item id on success', async () => {
    const { createFeedbackItem } = await import('@/lib/feedback');

    const item = await createFeedbackItem({
      userId: 'user_1',
      message: 'Great experience overall',
      source: 'dashboard',
      context: {
        pathname: '/app',
        userAgent: 'test-agent',
        timestampIso: new Date().toISOString(),
      },
    });

    expect(item).toEqual({ id: 'feedback_1' });
  });

  it('throws when insert returns no row', async () => {
    mockReturning.mockResolvedValue([]);

    const { createFeedbackItem } = await import('@/lib/feedback');

    await expect(
      createFeedbackItem({
        userId: null,
        message: 'Need clearer onboarding copy',
        context: {
          pathname: '/app/onboarding',
          userAgent: null,
          timestampIso: new Date().toISOString(),
        },
      })
    ).rejects.toThrow('Feedback persistence returned no row');
  });

  it('rethrows insert errors', async () => {
    mockReturning.mockRejectedValue(new Error('db failed'));

    const { createFeedbackItem } = await import('@/lib/feedback');

    await expect(
      createFeedbackItem({
        userId: null,
        message: 'Need clearer onboarding copy',
        context: {
          pathname: '/app/onboarding',
          userAgent: null,
          timestampIso: new Date().toISOString(),
        },
      })
    ).rejects.toThrow('db failed');
  });
});

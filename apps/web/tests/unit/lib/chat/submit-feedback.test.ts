import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindFirst = vi.hoisted(() => vi.fn());
const mockCreateFeedbackItem = vi.hoisted(() => vi.fn());
const mockNotifySlackFeedbackSubmission = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      users: {
        findFirst: mockFindFirst,
      },
    },
  },
}));

vi.mock('@/lib/feedback', () => ({
  createFeedbackItem: mockCreateFeedbackItem,
}));

vi.mock('@/lib/notifications/providers/slack', () => ({
  notifySlackFeedbackSubmission: mockNotifySlackFeedbackSubmission,
}));

describe('submitChatFeedback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockFindFirst.mockResolvedValue({
      id: 'user_1',
      name: 'Test User',
      email: 'test@example.com',
    });
    mockCreateFeedbackItem.mockResolvedValue({ id: 'feedback_1' });
    mockNotifySlackFeedbackSubmission.mockResolvedValue(undefined);
  });

  it('returns success after persisted feedback', async () => {
    const { submitChatFeedback } = await import('@/lib/chat/submit-feedback');

    const result = await submitChatFeedback({
      clerkUserId: 'clerk_1',
      message: 'Please add richer collaboration tools',
    });

    expect(result).toEqual({ success: true });
  });

  it('returns failure when persistence fails', async () => {
    mockCreateFeedbackItem.mockRejectedValue(new Error('insert failed'));

    const { submitChatFeedback } = await import('@/lib/chat/submit-feedback');

    const result = await submitChatFeedback({
      clerkUserId: 'clerk_1',
      message: 'Please add richer collaboration tools',
    });

    expect(result).toEqual({
      success: false,
      error: 'Unable to submit feedback right now.',
    });
    expect(mockNotifySlackFeedbackSubmission).not.toHaveBeenCalled();
  });
});

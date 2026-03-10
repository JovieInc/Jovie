import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_URL } from '@/constants/app';
import {
  notifyVerificationRequest,
  sendVerificationApprovedEmail,
} from '@/lib/verification/notifications';

const mockSendSlackMessage = vi.hoisted(() => vi.fn());
const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock('@/lib/notifications/providers/slack', () => ({
  sendSlackMessage: mockSendSlackMessage,
}));

vi.mock('@/lib/email/send', () => ({
  sendEmail: mockSendEmail,
}));

describe('verification notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendSlackMessage.mockResolvedValue({ status: 'sent' });
    mockSendEmail.mockResolvedValue({ success: true, messageId: 'msg_123' });
  });

  it('sends a Slack notification for verification requests', async () => {
    const result = await notifyVerificationRequest({
      name: 'Alex Artist',
      email: 'alex@example.com',
      username: 'alex',
      profileId: 'profile_1',
    });

    expect(mockSendSlackMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Alex Artist requested profile verification',
      })
    );

    const slackPayload = mockSendSlackMessage.mock.calls[0][0] as {
      blocks?: Array<{ text?: { text: string } }>;
    };

    expect(slackPayload.blocks?.[0]?.text?.text).toContain(
      `<${APP_URL}/alex|Open profile>`
    );
    expect(result).toEqual({ status: 'sent' });
  });

  it('sends Tim-style plain email after verification is approved', async () => {
    await sendVerificationApprovedEmail({
      to: 'pro@example.com',
      firstName: 'Sam',
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'pro@example.com',
        subject: 'Quick update from Tim',
      })
    );

    const emailPayload = mockSendEmail.mock.calls[0][0] as {
      text: string;
      html: string;
    };

    expect(emailPayload.text).toContain('Sam');
    expect(emailPayload.text).toContain('— Tim');
    expect(emailPayload.html).toContain('pushed it through for you');
  });
});

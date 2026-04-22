import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_URL } from '@/constants/app';
import {
  notifyVerificationRequest,
  sendVerificationApprovedEmail,
} from '@/lib/verification/notifications';

const mockSendSlackMessage = vi.hoisted(() => vi.fn());
const mockSendEmail = vi.hoisted(() => vi.fn());
const mockFormatFounderSender = vi.hoisted(() =>
  vi.fn(() => 'Tim White <tim@send.jov.ie>')
);
const mockGetSenderPolicy = vi.hoisted(() =>
  vi.fn(() => ({
    fromEmail: 'tim@send.jov.ie',
    replyToEmail: 'tim@jov.ie',
  }))
);

vi.mock('@/lib/notifications/providers/slack', () => ({
  sendSlackMessage: mockSendSlackMessage,
}));

vi.mock('@/lib/email/send', () => ({
  sendEmail: mockSendEmail,
}));

vi.mock('@/lib/notifications/sender-policy', () => ({
  formatFounderSender: mockFormatFounderSender,
  getSenderPolicy: mockGetSenderPolicy,
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
      `<${BASE_URL}/alex|Open profile>`
    );
    expect(result).toEqual({ status: 'sent' });
  });

  it('sends exact Tim-style email after verification is approved', async () => {
    await sendVerificationApprovedEmail({
      to: 'pro@example.com',
      firstName: 'Sam',
    });

    const expectedText =
      'Sam,\n\n' +
      'Hey, just saw you requested verification - pushed it through for you. Really excited to have you on the product. Let me know if you have any questions or feedback.\n\n' +
      '- Tim';
    const expectedHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quick update from Tim</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #ffffff;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 520px; margin: 0 auto;">
          <tr>
            <td style="font-size: 15px; line-height: 1.7; color: #333;">
              <p style="margin: 0 0 16px;">Sam,</p>
              <p style="margin: 0 0 16px;">Hey, just saw you requested verification - pushed it through for you. Really excited to have you on the product. Let me know if you have any questions or feedback.</p>
              <p style="margin: 0;">- Tim</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    expect(mockGetSenderPolicy).toHaveBeenCalledWith('founder');
    expect(mockFormatFounderSender).toHaveBeenCalledWith();
    expect(mockSendEmail).toHaveBeenCalledWith({
      to: 'pro@example.com',
      from: 'Tim White <tim@send.jov.ie>',
      replyTo: 'tim@jov.ie',
      subject: 'Quick update from Tim',
      text: expectedText,
      html: expectedHtml,
    });
  });

  it('uses a generic verification approval greeting for non-name input', async () => {
    await sendVerificationApprovedEmail({
      to: 'pro@example.com',
      firstName: '@bad_handle',
    });

    const emailPayload = mockSendEmail.mock.calls[0][0] as {
      html: string;
      text: string;
    };

    expect(emailPayload.text).toMatch(/^Hey there,\n\n/);
    expect(emailPayload.html).toContain(
      '<p style="margin: 0 0 16px;">Hey there,</p>'
    );
    expect(emailPayload.text).not.toContain('@bad_handle');
    expect(emailPayload.html).not.toContain('@bad_handle');
  });
});

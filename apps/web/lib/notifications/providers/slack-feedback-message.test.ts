import { describe, expect, it } from 'vitest';
import { buildSlackFeedbackNotification } from './slack-feedback-message';

describe('buildSlackFeedbackNotification', () => {
  it('does not include email addresses in Slack feedback notifications', () => {
    const payload = buildSlackFeedbackNotification({
      message: 'Please add richer collaboration tools',
      name: 'Test User',
      source: 'chat',
      pathname: '/app',
    });
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toMatch(/@/);
    expect(serialized).not.toMatch(/email/i);
    expect(serialized).not.toContain('📧');
    expect(payload.text).toBe('💬 Test User submitted feedback');
    expect(serialized).toContain('Source: chat');
    expect(serialized).toContain('Path: /app');
    expect(serialized).toContain('Please add richer collaboration tools');
  });
});

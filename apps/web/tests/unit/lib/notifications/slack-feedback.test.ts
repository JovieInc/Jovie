import { describe, expect, it } from 'vitest';

import {
  FEEDBACK_SLACK_MAX_CHARS,
  redactFeedbackMessageForSlack,
} from '@/lib/notifications/providers/slack';

describe('redactFeedbackMessageForSlack', () => {
  it('strips emails and does not leave the original address', () => {
    const redacted = redactFeedbackMessageForSlack(
      'Reach me at founder@example.com please'
    );
    expect(redacted).toContain('[REDACTED_EMAIL]');
    expect(redacted).not.toContain('founder@example.com');
  });

  it('truncates long feedback', () => {
    const redacted = redactFeedbackMessageForSlack('x'.repeat(400));
    expect(redacted.length).toBe(FEEDBACK_SLACK_MAX_CHARS + 1);
    expect(redacted.endsWith('…')).toBe(true);
  });
});

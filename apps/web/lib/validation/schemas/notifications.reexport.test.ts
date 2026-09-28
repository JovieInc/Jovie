import { describe, expect, it } from 'vitest';
import {
  getNotificationCaptureError as errorFromSource,
  NOTIFICATION_CAPTURE_ERROR_MESSAGES as messagesFromSource,
} from '@/lib/notifications/capture-validation';
import {
  getNotificationCaptureError,
  NOTIFICATION_CAPTURE_ERROR_MESSAGES,
} from '@/lib/validation/schemas/notifications';

describe('notification capture re-exports', () => {
  it('keeps the shared message catalog and the empty-email error', () => {
    expect(NOTIFICATION_CAPTURE_ERROR_MESSAGES).toBe(messagesFromSource);
    expect(getNotificationCaptureError).toBe(errorFromSource);
    expect(
      getNotificationCaptureError({ channel: 'email', value: '   ' })
    ).toBe(NOTIFICATION_CAPTURE_ERROR_MESSAGES.emailRequired);
    expect(
      getNotificationCaptureError({ channel: 'email', value: 'tim@jov.ie' })
    ).toBeNull();
  });
});

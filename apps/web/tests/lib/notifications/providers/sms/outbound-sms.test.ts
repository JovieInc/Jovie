import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
  OUTBOUND_SMS_ENABLED: 'true',
  TWILIO_ACCOUNT_SID: 'AC_test',
  TWILIO_AUTH_TOKEN: 'token_test',
  TWILIO_MESSAGING_SERVICE_SID: 'MG_test',
  TWILIO_FROM_NUMBER: '+15551234567',
}));

const mockSendTwilioSms = vi.hoisted(() => vi.fn());
const mockLogDelivery = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/env-server', () => ({
  env: mockEnv,
}));

vi.mock('@/lib/notifications/providers/sms/twilio-sender', () => ({
  sendTwilioSms: mockSendTwilioSms,
}));

vi.mock('@/lib/notifications/suppression', () => ({
  logDelivery: mockLogDelivery,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: mockLogger,
}));

import {
  isOutboundSmsEnabled,
  sendOutboundSms,
  sendOutboundSmsBestEffort,
} from '@/lib/notifications/providers/sms/outbound-sms';

describe('outbound-sms connector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.OUTBOUND_SMS_ENABLED = 'true';
    mockSendTwilioSms.mockResolvedValue({
      success: true,
      providerMessageId: 'SM_out_1',
      status: 'queued',
    });
    mockLogDelivery.mockResolvedValue(undefined);
  });

  describe('isOutboundSmsEnabled', () => {
    it('returns true for "true" and "1"', () => {
      mockEnv.OUTBOUND_SMS_ENABLED = 'true';
      expect(isOutboundSmsEnabled()).toBe(true);
      mockEnv.OUTBOUND_SMS_ENABLED = '1';
      expect(isOutboundSmsEnabled()).toBe(true);
    });

    it('returns false when unset or false', () => {
      mockEnv.OUTBOUND_SMS_ENABLED = undefined;
      expect(isOutboundSmsEnabled()).toBe(false);
      mockEnv.OUTBOUND_SMS_ENABLED = 'false';
      expect(isOutboundSmsEnabled()).toBe(false);
    });
  });

  describe('sendOutboundSms', () => {
    it('short-circuits when OUTBOUND_SMS_ENABLED is off', async () => {
      mockEnv.OUTBOUND_SMS_ENABLED = 'false';

      const result = await sendOutboundSms({
        to: '+15551112222',
        body: 'hello',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Outbound SMS disabled');
      }
      expect(mockSendTwilioSms).not.toHaveBeenCalled();
    });

    it('delegates to Twilio when enabled', async () => {
      const result = await sendOutboundSms({
        to: '+15551112222',
        body: 'hello',
      });

      expect(result.success).toBe(true);
      expect(mockSendTwilioSms).toHaveBeenCalledWith({
        to: '+15551112222',
        body: 'hello',
      });
    });
  });

  describe('sendOutboundSmsBestEffort', () => {
    it('skips without throwing when outbound is disabled', async () => {
      mockEnv.OUTBOUND_SMS_ENABLED = 'false';

      await sendOutboundSmsBestEffort({
        to: '+15551112222',
        body: 'STOP ack',
        source: 'sms_webhook_stop_applied',
        providerEventId: 'mid_1',
      });

      expect(mockSendTwilioSms).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipping outbound reply'),
        expect.objectContaining({ source: 'sms_webhook_stop_applied' })
      );
    });

    it('logs delivery on success', async () => {
      await sendOutboundSmsBestEffort({
        to: '+15551112222',
        body: 'STOP ack',
        source: 'sms_webhook_stop_applied',
        providerEventId: 'mid_1',
        metadata: { kind: 'stop_applied' },
      });

      expect(mockLogDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'sms',
          status: 'sent',
          providerMessageId: 'SM_out_1',
          metadata: expect.objectContaining({
            source: 'sms_webhook_stop_applied',
            providerEventId: 'mid_1',
          }),
        })
      );
    });

    it('logs failure and captures error without throwing', async () => {
      mockSendTwilioSms.mockResolvedValue({
        success: false,
        error: 'Twilio down',
        errorCode: '20003',
        httpStatus: 401,
        retryable: false,
      });

      await expect(
        sendOutboundSmsBestEffort({
          to: '+15551112222',
          body: 'HELP',
          source: 'sms_webhook_help_replied',
        })
      ).resolves.toBeUndefined();

      expect(mockLogDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorMessage: 'Twilio down',
        })
      );
      expect(mockCaptureError).toHaveBeenCalled();
    });
  });
});

import { describe, expect, it } from 'vitest';
import { buildAiTelemetry } from '@/lib/ai/telemetry';

describe('buildAiTelemetry', () => {
  it('maps userId and sessionId into Agnost metadata', () => {
    const telemetry = buildAiTelemetry({
      functionId: 'jovie-chat',
      identity: {
        userId: 'user_123',
        sessionId: 'conv_456',
      },
      metadata: { model: 'anthropic/claude-sonnet' },
    });

    expect(telemetry).toEqual({
      isEnabled: true,
      recordInputs: false,
      recordOutputs: false,
      functionId: 'jovie-chat',
      metadata: {
        userId: 'user_123',
        sessionId: 'conv_456',
        model: 'anthropic/claude-sonnet',
      },
    });
  });

  it('omits null identity fields', () => {
    const telemetry = buildAiTelemetry({
      functionId: 'jovie-chat-title',
      identity: { userId: null, sessionId: undefined },
    });

    expect(telemetry.metadata).toEqual({});
  });
});

import { describe, expect, it } from 'vitest';
import { isCoreChatHarnessTrace, makeCoreChatTrace } from './core-chat-harness';

describe('isCoreChatHarnessTrace', () => {
  it('accepts the known reason set and rejects an unknown reason', () => {
    expect(
      isCoreChatHarnessTrace(
        makeCoreChatTrace(
          { requestId: 'req-completed' },
          {
            status: 'invoked',
            reason: 'completed',
            sessionId: 'sess-1',
          },
          12
        )
      )
    ).toBe(true);

    expect(
      isCoreChatHarnessTrace(
        makeCoreChatTrace(
          { requestId: 'req-disabled' },
          {
            status: 'disabled',
            reason: 'feature_disabled',
            available: false,
          },
          0
        )
      )
    ).toBe(true);

    const timeout = makeCoreChatTrace(
      { requestId: 'req-timeout' },
      { status: 'fallback', reason: 'timeout', available: false },
      4
    );
    expect(isCoreChatHarnessTrace(timeout)).toBe(true);
    expect(isCoreChatHarnessTrace({ ...timeout, reason: 'not-a-reason' })).toBe(
      false
    );
  });
});

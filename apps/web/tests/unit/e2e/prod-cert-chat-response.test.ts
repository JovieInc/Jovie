import { Buffer } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertChatResponseOk } from '@/tests/e2e/utils/prod-cert-chat-response';

const REQUEST_ID = 'c9825f32-9a16-4af0-9396-a0df0a0a12ad';

function response(
  status: number,
  body: string,
  headers: Record<string, string> = {}
) {
  return {
    status: () => status,
    ok: () => status >= 200 && status < 300,
    headers: (): Record<string, string> => ({
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': REQUEST_ID,
      ...headers,
    }),
    body: vi.fn().mockResolvedValue(Buffer.from(body)),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('production chat HTTP diagnostics', () => {
  it.each([
    [401, 'AUTH_REQUIRED'],
    [409, 'TURN_IN_PROGRESS'],
    [429, 'RATE_LIMITED'],
    [500, 'CHAT_STREAM_FAILED'],
  ] as const)(
    'rejects HTTP %i without a terminal-failure header',
    async (status, errorCode) => {
      const candidate = response(
        status,
        JSON.stringify({
          errorCode,
          error: 'private response prose',
          debugMessage: 'private debug details',
          requestId: 'private body identifier',
        })
      );

      await expect(assertChatResponseOk(candidate)).rejects.toMatchObject({
        message: `Chat POST /api/chat failed: HTTP ${status}; content-type=application/json; request-id=${REQUEST_ID}; error-code=${errorCode}`,
      });
    }
  );

  it('returns immediately for a successful open SSE body', async () => {
    const candidate = response(200, '', {
      'content-type': 'text/event-stream',
    });
    candidate.body.mockImplementation(
      () => new Promise<Buffer>(() => undefined)
    );

    await expect(assertChatResponseOk(candidate)).resolves.toBe(
      `HTTP 200; content-type=text/event-stream; request-id=${REQUEST_ID}`
    );
    expect(candidate.body).not.toHaveBeenCalled();
  });

  it('returns only safe metadata for a successful reply-timeout diagnostic', async () => {
    const candidate = response(200, 'private response prose', {
      'content-type': 'text/event-stream; private-token=do-not-log',
      'x-request-id': 'private-user-input',
      'set-cookie': 'private-cookie',
    });

    await expect(assertChatResponseOk(candidate)).resolves.toBe(
      'HTTP 200; content-type=text/event-stream; request-id=unavailable'
    );
    expect(candidate.body).not.toHaveBeenCalled();
  });

  it.each([
    'not JSON: private response prose',
    'null',
    JSON.stringify({
      errorCode: 'SECRET_BEARER_TOKEN',
      error: 'private error',
    }),
    JSON.stringify({ errorCode: 401 }),
    JSON.stringify({ message: 'private response prose' }),
    JSON.stringify({ errorCode: 'AUTH_REQUIRED', message: 'x'.repeat(4_096) }),
  ])('omits untrusted or oversized JSON diagnostics', async body => {
    await expect(
      assertChatResponseOk(response(500, body))
    ).rejects.toMatchObject({
      message: `Chat POST /api/chat failed: HTTP 500; content-type=application/json; request-id=${REQUEST_ID}; error-code=unavailable`,
    });
  });

  it('omits arbitrary header data and does not read a non-JSON error body', async () => {
    const candidate = response(502, '<html>private upstream failure</html>', {
      'content-type': 'text/html; private-token=do-not-log',
      'x-request-id': 'private-user-input',
      'set-cookie': 'private-cookie',
    });

    await expect(assertChatResponseOk(candidate)).rejects.toMatchObject({
      message:
        'Chat POST /api/chat failed: HTTP 502; content-type=text/html; request-id=unavailable; error-code=unavailable',
    });
    expect(candidate.body).not.toHaveBeenCalled();
  });

  it('omits unknown or missing header values', async () => {
    const candidate = response(500, '{}');
    candidate.headers = () => ({});
    await expect(assertChatResponseOk(candidate)).rejects.toMatchObject({
      message:
        'Chat POST /api/chat failed: HTTP 500; content-type=unavailable; request-id=unavailable; error-code=unavailable',
    });
    expect(candidate.body).not.toHaveBeenCalled();

    const unknownType = response(500, '{}', {
      'content-type': 'private-token',
    });
    await expect(assertChatResponseOk(unknownType)).rejects.toMatchObject({
      message: `Chat POST /api/chat failed: HTTP 500; content-type=unavailable; request-id=${REQUEST_ID}; error-code=unavailable`,
    });
    expect(unknownType.body).not.toHaveBeenCalled();
  });

  it('still reports HTTP failure when error-body reading fails', async () => {
    const candidate = response(500, '{}');
    candidate.body.mockRejectedValue(new Error('private network failure'));

    await expect(assertChatResponseOk(candidate)).rejects.toMatchObject({
      message: `Chat POST /api/chat failed: HTTP 500; content-type=application/json; request-id=${REQUEST_ID}; error-code=unavailable`,
    });
  });

  it('bounds a stalled error-body read', async () => {
    vi.useFakeTimers();
    const candidate = response(500, '{}');
    candidate.body.mockImplementation(
      () => new Promise<Buffer>(() => undefined)
    );
    const assertion = expect(
      assertChatResponseOk(candidate)
    ).rejects.toMatchObject({
      message: `Chat POST /api/chat failed: HTTP 500; content-type=application/json; request-id=${REQUEST_ID}; error-code=unavailable`,
    });

    await vi.advanceTimersByTimeAsync(500);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});

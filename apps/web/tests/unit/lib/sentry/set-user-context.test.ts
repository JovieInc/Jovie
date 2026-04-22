import { beforeEach, describe, expect, it, vi } from 'vitest';

const setUserMock = vi.fn();
const setTagMock = vi.fn();
const headersGetMock = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', () => ({
  setUser: (...args: unknown[]) => setUserMock(...args),
  setTag: (...args: unknown[]) => setTagMock(...args),
}));
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => headersGetMock(name) }),
}));

// Import after mocks so the module resolves to the mocked deps.
const { attachSentryContext } = await import('@/lib/sentry/set-user-context');
const { maskUserIdForLog } = await import('@/lib/auth/mask-user-id');

describe('attachSentryContext', () => {
  beforeEach(() => {
    setUserMock.mockReset();
    setTagMock.mockReset();
    headersGetMock.mockReset();
  });

  it('sets Sentry user with the masked id, never the raw Clerk id', async () => {
    headersGetMock.mockReturnValue(null);
    const rawId = 'user_2abcd1234EFGH';

    await attachSentryContext(rawId);

    expect(setUserMock).toHaveBeenCalledTimes(1);
    const arg = setUserMock.mock.calls[0][0];
    expect(arg.id).toBe(maskUserIdForLog(rawId));
    expect(arg.id).not.toBe(rawId);
    expect(arg.id).not.toContain('EFGH');
  });

  it('skips setUser when userId is null or undefined', async () => {
    headersGetMock.mockReturnValue(null);

    await attachSentryContext(null);
    await attachSentryContext(undefined);

    expect(setUserMock).not.toHaveBeenCalled();
  });

  it('sets request_id tag when the header is present', async () => {
    headersGetMock.mockImplementation((name: string) =>
      name === 'x-request-id' ? 'req_abc123' : null
    );

    await attachSentryContext('user_xxxxAAAA');

    expect(setTagMock).toHaveBeenCalledWith('request_id', 'req_abc123');
  });

  it('does not set request_id tag when the header is missing', async () => {
    headersGetMock.mockReturnValue(null);

    await attachSentryContext('user_xxxxAAAA');

    expect(setTagMock).not.toHaveBeenCalled();
  });

  it('never throws when Sentry or headers fail', async () => {
    headersGetMock.mockImplementation(() => {
      throw new Error('headers not available');
    });
    setUserMock.mockImplementation(() => {
      throw new Error('sentry init race');
    });

    await expect(attachSentryContext('user_xxxxAAAA')).resolves.toBeUndefined();
  });
});

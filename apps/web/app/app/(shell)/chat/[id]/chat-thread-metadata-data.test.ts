import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The thread title is needed by both `generateMetadata` and the page. React
 * `cache()` is mocked to a per-function memo (one "request" per test) so the
 * dedupe is observable; the global test setup turns `cache()` into a no-op.
 */

const mocks = vi.hoisted(() => ({
  getSessionContext: vi.fn(),
  limit: vi.fn(),
  select: vi.fn(),
  requestMemos: [] as Array<Map<string, unknown>>,
}));

vi.mock('server-only', () => ({}));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => {
      const memo = new Map<string, unknown>();
      mocks.requestMemos.push(memo);
      return ((...args: never[]) => {
        const key = JSON.stringify(args);
        if (!memo.has(key)) memo.set(key, fn(...args));
        return memo.get(key);
      }) as T;
    },
  };
});

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: mocks.getSessionContext,
}));

vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));

vi.mock('../DeferredChatPageClient', () => ({
  DeferredChatPageClient: () => null,
}));

import ChatConversationPage, { generateMetadata } from './page';

const propsFor = (id: string) => ({ params: Promise.resolve({ id }) });

describe('chat thread title read', () => {
  beforeEach(() => {
    for (const memo of mocks.requestMemos) memo.clear();
    mocks.getSessionContext.mockReset().mockResolvedValue({
      user: { id: 'user-1' },
    });
    mocks.limit.mockReset().mockResolvedValue([{ title: 'Launch Plan' }]);
    mocks.select.mockReset().mockReturnValue({
      from: () => ({ where: () => ({ limit: mocks.limit }) }),
    });
  });

  it('reads the title once for the metadata and the page of one request', async () => {
    const [metadata, page] = await Promise.all([
      generateMetadata(propsFor('conversation-1')),
      ChatConversationPage(propsFor('conversation-1')),
    ]);

    expect(metadata.title).toBe('Launch Plan');
    expect(page.props.initialConversationTitle).toBe('Launch Plan');
    expect(mocks.getSessionContext).toHaveBeenCalledOnce();
    expect(mocks.select).toHaveBeenCalledOnce();
    expect(mocks.limit).toHaveBeenCalledOnce();
  });

  it('reads each thread separately', async () => {
    await generateMetadata(propsFor('conversation-1'));
    await ChatConversationPage(propsFor('conversation-2'));

    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it('keeps the signed-out and failed-read fallbacks', async () => {
    mocks.getSessionContext.mockResolvedValue({ user: null });
    const signedOut = await generateMetadata(propsFor('conversation-1'));
    expect(signedOut.title).toBe('Chat');
    expect(mocks.select).not.toHaveBeenCalled();

    mocks.getSessionContext.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.limit.mockRejectedValue(new Error('db down'));
    const failed = await ChatConversationPage(propsFor('conversation-3'));
    expect(failed.props.initialConversationTitle).toBeNull();
  });
});

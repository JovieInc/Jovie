import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('OldChatPage redirect', () => {
  it('redirects to /app/chat when no query params are present', async () => {
    const { default: OldChatPage } = await import(
      '@/app/app/(shell)/dashboard/chat/page'
    );

    await OldChatPage({});

    expect(redirectMock).toHaveBeenCalledWith('/app/chat');
  });

  it('preserves q query param for auto-start prompts', async () => {
    const { default: OldChatPage } = await import(
      '@/app/app/(shell)/dashboard/chat/page'
    );

    await OldChatPage({
      searchParams: Promise.resolve({ q: 'Help me change my profile photo.' }),
    });

    expect(redirectMock).toHaveBeenCalledWith(
      '/app/chat?q=Help+me+change+my+profile+photo.'
    );
  });

  it('preserves repeated query params', async () => {
    const { default: OldChatPage } = await import(
      '@/app/app/(shell)/dashboard/chat/page'
    );

    await OldChatPage({
      searchParams: Promise.resolve({
        q: 'hello',
        foo: ['bar', 'baz'],
      }),
    });

    expect(redirectMock).toHaveBeenCalledWith(
      '/app/chat?q=hello&foo=bar&foo=baz'
    );
  });
});

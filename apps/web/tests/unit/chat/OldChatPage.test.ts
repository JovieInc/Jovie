import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('legacy dashboard chat redirect', () => {
  afterEach(() => {
    redirectMock.mockClear();
  });

  it('is preserved in next.config.js', async () => {
    const nextConfig = require('../../../next.config.js');
    const redirects = await nextConfig.redirects();
    const legacyRedirect = redirects.find(
      (redirect: { source: string }) =>
        redirect.source === '/app/dashboard/chat'
    );

    expect(legacyRedirect).toMatchObject({
      source: '/app/dashboard/chat',
      destination: APP_ROUTES.CHAT,
      permanent: false,
    });
  });

  it('preserves query params when the page-level redirect handles the request', async () => {
    const { default: OldChatPage } = await import(
      '../../../app/app/(shell)/dashboard/chat/page'
    );

    await OldChatPage({
      searchParams: Promise.resolve({
        skill: 'feedback',
        tag: ['urgent', 'artist'],
      }),
    });

    expect(redirectMock).toHaveBeenCalledWith(
      `${APP_ROUTES.CHAT}?skill=feedback&tag=urgent&tag=artist`
    );
  });

  it('uses the canonical chat route when there are no query params', async () => {
    const { default: OldChatPage } = await import(
      '../../../app/app/(shell)/dashboard/chat/page'
    );

    await OldChatPage({ searchParams: Promise.resolve({}) });

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.CHAT);
  });
});

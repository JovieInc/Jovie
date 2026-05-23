import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  })
);

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import NotificationsPage from '../../../../app/[username]/notifications/page';

describe('NotificationsPage', () => {
  it('redirects the legacy notifications route to the in-profile alerts tab', async () => {
    await expect(
      NotificationsPage({ params: Promise.resolve({ username: 'testartist' }) })
    ).rejects.toThrow('NEXT_REDIRECT:/testartist?mode=subscribe');

    expect(redirectMock).toHaveBeenCalledWith('/testartist?mode=subscribe');
  });
});

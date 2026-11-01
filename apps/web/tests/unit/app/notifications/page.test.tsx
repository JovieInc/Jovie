import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  })
);
const { connectionMock, profileMock } = vi.hoisted(() => ({
  connectionMock: vi.fn(),
  profileMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));
vi.mock('next/server', () => ({ connection: connectionMock }));
vi.mock('@/app/[username]/_lib/public-profile-loader', () => ({
  getProfileAndLinks: profileMock,
}));

import NotificationsPage, {
  generateMetadata,
} from '../../../../app/[username]/notifications/page';

const props = () => ({ params: Promise.resolve({ username: 'testartist' }) });

beforeEach(() => {
  vi.clearAllMocks();
  connectionMock.mockReset().mockResolvedValue(undefined);
  profileMock.mockReset().mockResolvedValue({
    profile: { display_name: 'Test Artist', username_normalized: 'testartist' },
  });
});

describe('NotificationsPage', () => {
  it('waits for a request before reading profile metadata', async () => {
    const request = Promise.withResolvers<void>();
    connectionMock.mockReturnValue(request.promise);

    const metadata = generateMetadata(props());
    await Promise.resolve();
    expect(profileMock).not.toHaveBeenCalled();

    request.resolve();
    expect(await metadata).toMatchObject({
      title: 'Get notifications from Test Artist',
    });
    expect(profileMock).toHaveBeenCalledExactlyOnceWith('testartist');
  });

  it('propagates the request boundary rejection without reading profile data', async () => {
    const error = new Error('request unavailable');
    connectionMock.mockRejectedValue(error);

    await expect(generateMetadata(props())).rejects.toBe(error);
    expect(profileMock).not.toHaveBeenCalled();
  });

  it('redirects the legacy notifications route to the in-profile alerts tab after a request arrives', async () => {
    const request = Promise.withResolvers<void>();
    connectionMock.mockReturnValue(request.promise);

    const page = NotificationsPage(props());
    await Promise.resolve();
    expect(redirectMock).not.toHaveBeenCalled();

    request.resolve();
    await expect(page).rejects.toThrow(
      'NEXT_REDIRECT:/testartist?mode=subscribe'
    );

    expect(redirectMock).toHaveBeenCalledExactlyOnceWith(
      '/testartist?mode=subscribe'
    );
    expect(profileMock).not.toHaveBeenCalled();
  });
});

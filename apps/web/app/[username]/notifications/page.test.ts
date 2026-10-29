import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  profile: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('../_lib/public-profile-loader', () => ({
  getProfileAndLinks: mocks.profile,
}));
vi.mock('@/features/profile/registry', () => ({
  getProfileModeHref: (username: string, mode: string) =>
    `/${username}?mode=${mode}`,
}));

import NotificationsPage, { generateMetadata } from './page';

const props = () => ({ params: Promise.resolve({ username: 'testartist' }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connection.mockResolvedValue(undefined);
  mocks.profile.mockResolvedValue({
    profile: { display_name: 'Test Artist', username_normalized: 'testartist' },
  });
  mocks.redirect.mockImplementation(() => {
    throw new Error('redirect');
  });
});

describe('notifications request-time rendering', () => {
  it('waits for a request before reading profile metadata', async () => {
    const request = Promise.withResolvers<void>();
    mocks.connection.mockReturnValue(request.promise);

    const metadata = generateMetadata(props());
    await Promise.resolve();
    expect(mocks.profile).not.toHaveBeenCalled();

    request.resolve();
    expect(await metadata).toMatchObject({
      title: 'Get notifications from Test Artist',
    });
    expect(mocks.profile).toHaveBeenCalledExactlyOnceWith('testartist');
  });

  it('propagates the request boundary rejection without reading profile data', async () => {
    const error = new Error('request unavailable');
    mocks.connection.mockRejectedValue(error);

    await expect(generateMetadata(props())).rejects.toBe(error);
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it('waits for a request before redirecting to the subscription mode', async () => {
    const request = Promise.withResolvers<void>();
    mocks.connection.mockReturnValue(request.promise);

    const page = NotificationsPage(props());
    await Promise.resolve();
    expect(mocks.redirect).not.toHaveBeenCalled();

    request.resolve();
    await expect(page).rejects.toThrow('redirect');
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(
      '/testartist?mode=subscribe'
    );
    expect(mocks.profile).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redirectToProfileMode } from '../../../app/[username]/_lib/mode-route-redirect';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('profile mode route redirects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to the canonical tour mode URL', async () => {
    await redirectToProfileMode(
      Promise.resolve({ username: 'testartist' }),
      Promise.resolve({}),
      'tour'
    );

    expect(redirectMock).toHaveBeenCalledWith('/testartist?mode=tour');
  });

  it('preserves source query params for server redirects', async () => {
    await redirectToProfileMode(
      Promise.resolve({ username: 'testartist' }),
      Promise.resolve({ source: 'qr' }),
      'tip'
    );

    expect(redirectMock).toHaveBeenCalledWith('/testartist?mode=tip&source=qr');
  });

  it('uses the first non-empty source value from repeated params', async () => {
    await redirectToProfileMode(
      Promise.resolve({ username: 'testartist' }),
      Promise.resolve({ source: ['', 'campaign'] }),
      'listen'
    );

    expect(redirectMock).toHaveBeenCalledWith(
      '/testartist?mode=listen&source=campaign'
    );
  });
});

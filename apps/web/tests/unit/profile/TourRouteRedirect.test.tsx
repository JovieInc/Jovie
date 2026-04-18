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
      'tour'
    );

    expect(redirectMock).toHaveBeenCalledWith('/testartist?mode=tour');
  });

  it('redirects to the canonical pay mode URL without server search params', async () => {
    await redirectToProfileMode(
      Promise.resolve({ username: 'testartist' }),
      'pay'
    );

    expect(redirectMock).toHaveBeenCalledWith('/testartist?mode=pay');
  });

  it('redirects to the canonical releases mode URL', async () => {
    await redirectToProfileMode(
      Promise.resolve({ username: 'testartist' }),
      'releases'
    );

    expect(redirectMock).toHaveBeenCalledWith('/testartist?mode=releases');
  });
});

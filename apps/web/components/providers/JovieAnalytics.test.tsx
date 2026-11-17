import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

type AuthState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
};

type UserState = {
  user: {
    primaryEmailAddress?: { emailAddress: string } | null;
    username?: string | null;
    fullName?: string | null;
  } | null;
};

const state = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'user-1' } as AuthState,
  user: { user: null } as UserState,
  identify: vi.fn(),
}));

vi.mock('@/hooks/useJovieAuth', () => ({
  useAuthSafe: () => state.auth,
  useUserSafe: () => state.user,
}));
vi.mock('@/lib/analytics', () => ({ identify: state.identify }));

import { JovieAnalytics } from './JovieAnalytics';

describe('JovieAnalytics', () => {
  beforeEach(() => {
    state.identify.mockReset();
    state.auth = { isLoaded: true, isSignedIn: true, userId: 'user-1' };
    state.user = {
      user: {
        primaryEmailAddress: { emailAddress: 'artist@example.com' },
        username: 'timwhite',
        fullName: 'Tim White',
      },
    };
  });

  it('identifies the signed-in user with their traits and renders nothing', async () => {
    const { container } = render(<JovieAnalytics />);

    expect(container).toBeEmptyDOMElement();
    expect(state.identify).toHaveBeenCalledWith('user-1', {
      email: 'artist@example.com',
      username: 'timwhite',
      full_name: 'Tim White',
    });
    await expectNoA11yViolations(container);
  });

  it('sends undefined traits when the user has no profile details yet', () => {
    state.user = { user: null };
    render(<JovieAnalytics />);

    expect(state.identify).toHaveBeenCalledWith('user-1', {
      email: undefined,
      username: undefined,
      full_name: undefined,
    });
  });

  it.each([
    ['still loading', { isLoaded: false, isSignedIn: false, userId: null }],
    ['signed out', { isLoaded: true, isSignedIn: false, userId: null }],
    ['missing a user id', { isLoaded: true, isSignedIn: true, userId: null }],
  ])('identifies nobody while the session is %s', async (_label, auth) => {
    state.auth = auth;
    const { container } = render(<JovieAnalytics />);

    expect(state.identify).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});

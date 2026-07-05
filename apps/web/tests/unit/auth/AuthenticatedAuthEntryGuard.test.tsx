import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { replaceMock, searchParamsState, authState } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  searchParamsState: { value: '' },
  authState: {
    isLoaded: true,
    isSignedIn: false,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => authState,
}));

import { AuthenticatedAuthEntryGuard } from '@/components/features/auth/AuthenticatedAuthEntryGuard';
import { APP_ROUTES } from '@/constants/routes';

describe('AuthenticatedAuthEntryGuard', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    searchParamsState.value = '';
    authState.isLoaded = true;
    authState.isSignedIn = false;
    document.cookie =
      '__client_uat=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie =
      '__e2e_test_user_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  });

  it('renders children for signed-out visitors', async () => {
    const { getByText } = render(
      <AuthenticatedAuthEntryGuard>
        <div>Sign-in form</div>
      </AuthenticatedAuthEntryGuard>
    );

    expect(getByText('Sign-in form')).toBeInTheDocument();
    await waitFor(() => {
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it('redirects authenticated Clerk users before rendering auth flows', async () => {
    authState.isSignedIn = true;

    const { queryByText } = render(
      <AuthenticatedAuthEntryGuard>
        <div>Sign-in form</div>
      </AuthenticatedAuthEntryGuard>
    );

    expect(queryByText('Sign-in form')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
    });
  });

  it('preserves a safe redirect_url for authenticated users', async () => {
    authState.isSignedIn = true;
    searchParamsState.value = 'redirect_url=%2Fapp%2Fsettings';

    render(
      <AuthenticatedAuthEntryGuard>
        <div>Sign-in form</div>
      </AuthenticatedAuthEntryGuard>
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/app/settings');
    });
  });

  it('waits for Clerk when only the activity cookie is present', async () => {
    document.cookie = '__client_uat=1700000000';
    authState.isLoaded = false;
    authState.isSignedIn = false;

    const { queryByText } = render(
      <AuthenticatedAuthEntryGuard>
        <div>Sign-in form</div>
      </AuthenticatedAuthEntryGuard>
    );

    expect(queryByText('Sign-in form')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it('renders the sign-in form when a stale cookie outlives the session', async () => {
    document.cookie = '__client_uat=1700000000';
    authState.isLoaded = true;
    authState.isSignedIn = false;

    const { getByText } = render(
      <AuthenticatedAuthEntryGuard>
        <div>Sign-in form</div>
      </AuthenticatedAuthEntryGuard>
    );

    await waitFor(() => {
      expect(getByText('Sign-in form')).toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });
});

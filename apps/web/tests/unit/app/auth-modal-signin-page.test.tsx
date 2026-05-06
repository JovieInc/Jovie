import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { clerkSignInMock, routerBackMock, searchParamsState } = vi.hoisted(
  () => ({
    clerkSignInMock: vi.fn(),
    routerBackMock: vi.fn(),
    searchParamsState: { value: '' },
  })
);

vi.mock('@clerk/nextjs', () => ({
  SignIn: (props: unknown) => {
    clerkSignInMock(props);
    return <div data-testid='clerk-sign-in' />;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: routerBackMock,
  }),
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

import { APP_ROUTES } from '@/constants/routes';
import SigninModalPage from '../../../app/@auth/(.)signin/page';

describe('intercepted signin modal page', () => {
  const originalShowModal = HTMLDialogElement.prototype.showModal;

  beforeEach(() => {
    clerkSignInMock.mockReset();
    routerBackMock.mockReset();
    searchParamsState.value = '';
    HTMLDialogElement.prototype.showModal = vi.fn();
  });

  afterEach(() => {
    HTMLDialogElement.prototype.showModal = originalShowModal;
  });

  it('renders SignIn in the modal shell with signup link preservation', async () => {
    searchParamsState.value = 'redirect_url=%2Fonboarding';

    render(<SigninModalPage />);

    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });

    expect(clerkSignInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        routing: 'hash',
        oauthFlow: 'redirect',
        signUpUrl: '/signup?redirect_url=%2Fonboarding',
        fallbackRedirectUrl: APP_ROUTES.ONBOARDING,
      })
    );
  });

  it('falls back to dashboard when redirect_url is unsafe', async () => {
    searchParamsState.value = 'redirect_url=https%3A%2F%2Fevil.example';

    render(<SigninModalPage />);

    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });

    expect(clerkSignInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signUpUrl: APP_ROUTES.SIGNUP,
        fallbackRedirectUrl: APP_ROUTES.DASHBOARD,
      })
    );
  });
});

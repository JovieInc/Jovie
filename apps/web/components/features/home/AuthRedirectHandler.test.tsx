import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

import { AuthRedirectHandler } from './AuthRedirectHandler';

const SESSION_COOKIE = 'better-auth.session_token';

function clearSessionCookies() {
  for (const name of [SESSION_COOKIE, '__client_uat']) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  }
}

describe('AuthRedirectHandler certificate', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    clearSessionCookies();
  });

  it('renders nothing and stays on the page for an anonymous visitor', async () => {
    const { container } = render(<AuthRedirectHandler />);

    await waitFor(() => expect(replaceMock).not.toHaveBeenCalled());
    expect(
      screen.queryByTestId('auth-redirect-overlay')
    ).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('covers the page with a hidden overlay and redirects a signed-in visitor to the dashboard', async () => {
    document.cookie = `${SESSION_COOKIE}=signed-session; path=/`;

    const { container } = render(<AuthRedirectHandler />);

    const overlay = screen.getByTestId('auth-redirect-overlay');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(overlay).toHaveClass('fixed', 'inset-0');
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(APP_ROUTES.DASHBOARD)
    );
    expect(replaceMock).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('treats a cleared leftover activity cookie as anonymous', async () => {
    document.cookie = '__client_uat=0; path=/';

    const { container } = render(<AuthRedirectHandler />);

    await waitFor(() => expect(replaceMock).not.toHaveBeenCalled());
    expect(
      screen.queryByTestId('auth-redirect-overlay')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

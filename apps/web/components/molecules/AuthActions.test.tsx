import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const { useIsAuthenticated } = vi.hoisted(() => ({
  useIsAuthenticated: vi.fn(() => false),
}));

vi.mock('@/hooks/useIsAuthenticated', () => ({ useIsAuthenticated }));

import { AuthActions } from './AuthActions';

describe('AuthActions', () => {
  beforeEach(() => {
    useIsAuthenticated.mockReturnValue(false);
  });

  it('offers Log in then Sign up, in that tab order, when signed out', async () => {
    const user = userEvent.setup();
    const { container } = render(<AuthActions />);

    const logIn = screen.getByRole('link', { name: 'Log in' });
    const signUp = screen.getByRole('link', { name: 'Sign up' });
    expect(logIn).toHaveAttribute('href', APP_ROUTES.SIGNIN);
    expect(signUp).toHaveAttribute('href', APP_ROUTES.START);
    expect(screen.queryByRole('link', { name: 'Open App' })).toBeNull();
    await expectNoA11yViolations(container);

    await user.tab();
    expect(logIn).toHaveFocus();
    await user.tab();
    expect(signUp).toHaveFocus();
  });

  it('swaps to one Open App link once a session cookie is found', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<AuthActions />);
    expect(screen.getAllByRole('link')).toHaveLength(2);

    useIsAuthenticated.mockReturnValue(true);
    rerender(<AuthActions />);

    const openApp = screen.getByRole('link', { name: 'Open App' });
    expect(openApp).toHaveAttribute('href', APP_ROUTES.DASHBOARD);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull();
    await user.tab();
    expect(openApp).toHaveFocus();
    await expectNoA11yViolations(container);
  });
});

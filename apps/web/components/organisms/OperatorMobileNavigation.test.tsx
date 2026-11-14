import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OperatorMobileNavigation } from './OperatorMobileNavigation';
import { OPERATOR_NAV_ITEMS } from './operator-navigation';

const { mockPathname, mockSignOut } = vi.hoisted(() => ({
  mockPathname: vi.fn(() => '/'),
  mockSignOut: vi.fn(async () => undefined),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ signOut: mockSignOut }),
}));

describe('OperatorMobileNavigation', () => {
  beforeEach(() => {
    mockPathname.mockReset();
    mockPathname.mockReturnValue(
      OPERATOR_NAV_ITEMS[0]?.href ?? APP_ROUTES.DASHBOARD
    );
    mockSignOut.mockClear();
  });

  it('renders the first four operator destinations in the bottom bar', async () => {
    const { container } = render(<OperatorMobileNavigation />);

    const nav = screen.getByRole('navigation', {
      name: 'OV Mobile Navigation',
    });
    expect(nav).toBeInTheDocument();
    for (const item of OPERATOR_NAV_ITEMS.slice(0, 4)) {
      expect(
        screen.getAllByRole('link', { name: item.label }).length
      ).toBeGreaterThan(0);
    }
    await expectNoA11yViolations(container);
  });

  it('opens the expanded operator menu and signs out to the home page', async () => {
    const user = userEvent.setup();
    const { container } = render(<OperatorMobileNavigation />);

    await user.click(screen.getByRole('button', { name: 'More options' }));

    expect(
      screen.getByRole('dialog', { name: 'OV Navigation Menu' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: /Sign out/ }));

    expect(mockSignOut).toHaveBeenCalledExactlyOnceWith({ redirectUrl: '/' });
  });
});

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorMobileNavigation } from '@/components/organisms/OperatorMobileNavigation';
import {
  OPERATOR_NAV_ITEMS,
  OPERATOR_NAV_SECTIONS,
} from '@/components/organisms/operator-navigation';
import { ADMIN_NAV_REGISTRY } from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';
import {
  mobileExpandedNavigation,
  mobilePrimaryNavigation,
} from '@/features/dashboard/dashboard-nav/config';

const { signOutMock, pathnameMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  pathnameMock: vi.fn(() => '/app/ov'),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ signOut: signOutMock }),
}));

describe('OperatorMobileNavigation', () => {
  beforeEach(() => {
    signOutMock.mockReset();
    pathnameMock.mockReturnValue('/app/ov');
  });

  it('adapts every canonical registry entry once for both responsive renderers', () => {
    expect(
      OPERATOR_NAV_ITEMS.map(({ label, href }) => ({ label, href }))
    ).toEqual(ADMIN_NAV_REGISTRY.map(({ label, href }) => ({ label, href })));
    expect(OPERATOR_NAV_SECTIONS.flatMap(section => section.items)).toEqual(
      OPERATOR_NAV_ITEMS
    );
    expect(OPERATOR_NAV_ITEMS.every(item => item.icon)).toBe(true);
  });

  it('exposes every OV destination with accessible labels and no customer links', () => {
    render(<OperatorMobileNavigation />);

    const tabs = screen.getByRole('navigation', {
      name: 'OV Mobile Navigation',
    });
    expect(
      screen.queryByRole('navigation', { name: 'OV Navigation Menu' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    const menu = screen.getByRole('navigation', {
      name: 'OV Navigation Menu',
    });

    for (const item of ADMIN_NAV_REGISTRY) {
      expect(
        within(menu).getByRole('link', { name: item.label })
      ).toHaveAttribute('href', item.href);
    }

    const customerHrefs = new Set(
      [...mobilePrimaryNavigation, ...mobileExpandedNavigation].map(
        item => item.href
      )
    );
    for (const href of customerHrefs) {
      expect(
        tabs
          .closest('[data-mobile-navigation]')
          ?.querySelector(`a[href="${href}"]`)
      ).toBeNull();
    }
  });

  it('opens without moving content and keeps the canonical sign-out action keyboard reachable', async () => {
    const user = userEvent.setup();
    render(<OperatorMobileNavigation />);

    const mobileNavigation = screen
      .getByRole('navigation', { name: 'OV Mobile Navigation' })
      .closest('[data-mobile-navigation]');
    expect(mobileNavigation).toHaveAttribute('data-layout', 'overlay');

    const more = screen.getByRole('button', { name: 'More options' });
    more.focus();
    await user.keyboard('{Enter}');
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('navigation', {
      name: 'OV Navigation Menu',
    });
    expect(within(menu).getByRole('link', { name: 'Overview' })).toHaveFocus();

    await user.tab();
    expect(within(menu).getByRole('link', { name: 'Ops' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('navigation', { name: 'OV Navigation Menu' })
    ).not.toBeInTheDocument();
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(more).toHaveFocus());

    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOutMock).toHaveBeenCalledWith({ redirectUrl: '/' });
  });

  it('closes on route changes without restoring focus to the previous trigger', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<OperatorMobileNavigation />);

    const more = screen.getByRole('button', { name: 'More options' });
    await user.click(more);
    expect(
      screen.getByRole('navigation', { name: 'OV Navigation Menu' })
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('navigation', { name: 'OV Navigation Menu' })
      ).getByRole('link', { name: 'Overview' })
    ).toHaveFocus();

    pathnameMock.mockReturnValue('/app/ov/ops');
    rerender(<OperatorMobileNavigation />);

    await waitFor(() =>
      expect(
        screen.queryByRole('navigation', { name: 'OV Navigation Menu' })
      ).not.toBeInTheDocument()
    );
    expect(more).not.toHaveFocus();
  });

  it('marks only the nested OV destination current while keeping the root exact-match', async () => {
    pathnameMock.mockReturnValue(`${APP_ROUTES.ADMIN_OPS}/agents`);
    const user = userEvent.setup();
    render(<OperatorMobileNavigation />);

    const primaryNavigation = screen.getByRole('navigation', {
      name: 'OV Mobile Navigation',
    });
    expect(
      within(primaryNavigation).getByRole('link', { name: 'Overview' })
    ).not.toHaveAttribute('aria-current');
    expect(
      within(primaryNavigation).getByRole('link', { name: 'Ops' })
    ).toHaveAttribute('aria-current', 'page');
    expect(
      primaryNavigation.querySelectorAll('[aria-current="page"]')
    ).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'More options' }));
    const expandedNavigation = screen.getByRole('navigation', {
      name: 'OV Navigation Menu',
    });
    expect(
      within(expandedNavigation).getByRole('link', { name: 'Overview' })
    ).not.toHaveAttribute('aria-current');
    expect(
      within(expandedNavigation).getByRole('link', { name: 'Ops' })
    ).toHaveAttribute('aria-current', 'page');
    expect(
      expandedNavigation.querySelectorAll('[aria-current="page"]')
    ).toHaveLength(1);
  });

  it('keeps five 44px bottom-bar targets within the 375px contract', () => {
    render(<OperatorMobileNavigation />);

    const tabs = screen.getByRole('navigation', {
      name: 'OV Mobile Navigation',
    });
    const controls = [
      ...within(tabs).getAllByRole('link'),
      ...within(tabs).getAllByRole('button'),
    ];

    expect(controls).toHaveLength(5);
    for (const control of controls) {
      expect(control).toHaveClass('min-h-11', 'min-w-16');
    }
    expect(5 * 64 + 2 * 8).toBeLessThanOrEqual(375);
  });
});

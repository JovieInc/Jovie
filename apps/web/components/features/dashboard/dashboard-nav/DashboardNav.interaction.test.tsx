import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  mockUsePathname,
  renderDashboardNav,
  resetDashboardNavTestMocks,
} from '@/tests/utils/dashboard-nav-test-support';

afterEach(resetDashboardNavTestMocks);

describe('Home and Inbox navigation', () => {
  it('opens Inbox from Home while retaining the Home destination', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.DASHBOARD);
    renderDashboardNav({ renderFn: render });
    const home = screen.getByRole('link', { name: 'Home' });
    const inbox = screen.getByRole('link', { name: 'Inbox' });
    expect(home).toHaveAttribute('href', APP_ROUTES.DASHBOARD);
    expect(inbox).toHaveAttribute('href', APP_ROUTES.INBOX);
    inbox.addEventListener('click', event => event.preventDefault());
    fireEvent.click(inbox);
    expect(inbox).toHaveAttribute('data-navigation-pending', 'true');
    expect(inbox).toHaveAttribute('aria-busy', 'true');
    expect(home).toHaveAttribute('href', APP_ROUTES.DASHBOARD);
  });
});

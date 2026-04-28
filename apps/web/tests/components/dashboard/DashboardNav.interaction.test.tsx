import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { APP_ROUTES } from '@/constants/routes';
import {
  mockClearPendingShell,
  mockOpenPreviewPanel,
  mockRouterPush,
  mockShowPendingShell,
  mockToastInfo,
  mockTogglePreviewPanel,
  mockUsePathname,
  renderDashboardNav,
  resetDashboardNavTestMocks,
} from '@/tests/utils/dashboard-nav-test-support';

describe('DashboardNav interactions', () => {
  afterEach(() => {
    resetDashboardNavTestMocks();
  });

  it('renders the full primary navigation config', () => {
    renderDashboardNav({ renderFn: render });

    expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Releases' })).toHaveAttribute(
      'href',
      APP_ROUTES.DASHBOARD_RELEASES
    );
    expect(screen.getByRole('link', { name: 'Audience' })).toHaveAttribute(
      'href',
      APP_ROUTES.DASHBOARD_AUDIENCE
    );
  });

  it('shows grouped admin navigation with growth links for admin users', () => {
    renderDashboardNav({
      renderFn: render,
      overrides: { isAdmin: true },
    });

    expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Growth' })).toHaveAttribute(
      'href',
      APP_ROUTES.ADMIN_GROWTH
    );
    expect(screen.getByRole('link', { name: 'People' })).toHaveAttribute(
      'href',
      APP_ROUTES.ADMIN_PEOPLE
    );
  });

  it('highlights the active route based on pathname', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.RELEASES);

    renderDashboardNav({ renderFn: render });

    expect(screen.getByRole('link', { name: 'Releases' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('button', { name: 'Profile' })).not.toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('exposes icon and label content for each navigation item', () => {
    renderDashboardNav({ renderFn: render });

    const profileButton = screen.getByRole('button', { name: 'Profile' });
    const iconNode = profileButton.querySelector('[data-sidebar-icon]');
    const labelNode = profileButton.querySelector('span.truncate');

    expect(iconNode).toBeTruthy();
    expect(labelNode).toHaveTextContent('Profile');
    expect(labelNode).toHaveClass('group-data-[collapsible=icon]:hidden');
  });

  it('profile button toggles the drawer when already on chat', async () => {
    const user = userEvent.setup();

    mockUsePathname.mockReturnValueOnce(APP_ROUTES.CHAT);
    renderDashboardNav({ renderFn: render });

    const profileButton = screen.getByRole('button', { name: 'Profile' });
    await user.click(profileButton);

    expect(mockTogglePreviewPanel).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('keeps the shell nav profile button wired to the same drawer action', async () => {
    const user = userEvent.setup();

    mockUsePathname.mockReturnValueOnce(APP_ROUTES.CHAT);
    renderDashboardNav({
      renderFn: render,
      appFlags: { SHELL_CHAT_V1: true },
    });

    await user.click(screen.getByRole('button', { name: 'Profile' }));

    expect(mockTogglePreviewPanel).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('profile button navigates to chat before opening the drawer off chat routes', async () => {
    const user = userEvent.setup();

    mockUsePathname.mockReturnValueOnce(APP_ROUTES.DASHBOARD_AUDIENCE);
    renderDashboardNav({ renderFn: render });

    await user.click(screen.getByRole('button', { name: 'Profile' }));

    expect(mockRouterPush).toHaveBeenCalledWith(APP_ROUTES.CHAT);
    expect(mockOpenPreviewPanel).toHaveBeenCalledTimes(1);
    expect(mockTogglePreviewPanel).not.toHaveBeenCalled();
  });

  it('shows the releases pending shell once for a pointer click', async () => {
    const user = userEvent.setup();

    renderDashboardNav({ renderFn: render });

    const releasesLink = screen.getByRole('link', { name: 'Releases' });
    releasesLink.addEventListener('click', event => event.preventDefault());

    await user.click(releasesLink);

    expect(mockShowPendingShell).toHaveBeenCalledTimes(1);
    expect(mockShowPendingShell).toHaveBeenCalledWith('releases');
  });

  it('does not show the releases pending shell when releases is already active', async () => {
    const user = userEvent.setup();

    mockUsePathname.mockReturnValueOnce(APP_ROUTES.RELEASES);
    renderDashboardNav({ renderFn: render });

    const releasesLink = screen.getByRole('link', { name: 'Releases' });
    releasesLink.addEventListener('click', event => event.preventDefault());

    await user.click(releasesLink);

    expect(mockShowPendingShell).not.toHaveBeenCalled();
    expect(mockClearPendingShell).not.toHaveBeenCalled();
  });

  it('does not hijack modified releases link clicks', async () => {
    renderDashboardNav({ renderFn: render });

    const releasesLink = screen.getByRole('link', { name: 'Releases' });
    releasesLink.addEventListener('click', event => event.preventDefault());
    fireEvent.pointerDown(releasesLink, {
      button: 0,
      metaKey: true,
    });
    fireEvent.click(releasesLink, {
      button: 0,
      metaKey: true,
    });

    expect(mockShowPendingShell).toHaveBeenCalledTimes(1);
    expect(mockClearPendingShell).toHaveBeenCalledTimes(1);
  });

  it('keeps demo-disabled items as links on nested demo routes', async () => {
    const user = userEvent.setup();

    mockUsePathname.mockReturnValueOnce('/demo/showcase/settings');
    renderDashboardNav({
      renderFn: render,
      overrides: {
        selectedProfile: {
          id: 'profile_123',
          displayName: 'Tim White',
          username: 'tim',
          usernameNormalized: 'tim',
        } as DashboardData['selectedProfile'],
      },
    });

    const tasksLink = screen.getByRole('link', { name: 'Tasks' });
    expect(tasksLink).toHaveAttribute('href', APP_ROUTES.DASHBOARD_TASKS);
    tasksLink.addEventListener('click', event => event.preventDefault());

    await user.click(tasksLink);

    expect(mockToastInfo).toHaveBeenCalledWith(
      'Tasks is not available in demo mode'
    );
  });
});

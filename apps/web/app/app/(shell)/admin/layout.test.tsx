import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { getCurrentAdminPageAccessMock, redirectMock } = vi.hoisted(() => ({
  getCurrentAdminPageAccessMock: vi.fn(),
  redirectMock: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock('server-only', () => ({}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/components/providers/QueryProvider', () => ({
  QueryProvider: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='query-provider'>{children}</div>
  ),
}));

vi.mock('@/lib/admin/page-access', () => ({
  getCurrentAdminPageAccess: getCurrentAdminPageAccessMock,
}));

import AdminLayout from './layout';

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders admin routes for role-authorized users without requiring fresh MFA', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      userId: 'user_admin',
      isAuthenticated: true,
      hasAdminRole: true,
    });

    render(
      await AdminLayout({
        children: <div data-testid='admin-content'>Admin content</div>,
      })
    );

    expect(screen.getByTestId('admin-content')).toBeVisible();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects authenticated non-admins to the dashboard fallback', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      userId: 'user_member',
      isAuthenticated: true,
      hasAdminRole: false,
    });

    await expect(
      AdminLayout({ children: <div>Admin content</div> })
    ).rejects.toThrow(`NEXT_REDIRECT:${APP_ROUTES.DASHBOARD}`);
    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
  });
});

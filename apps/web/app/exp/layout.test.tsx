import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCurrentAdminPageAccessMock, notFoundMock } = vi.hoisted(() => ({
  getCurrentAdminPageAccessMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('server-only', () => ({}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock('@/components/providers/QueryProvider', () => ({
  QueryProvider: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='query-provider'>{children}</div>
  ),
}));

vi.mock('@jovie/ui', () => ({
  TooltipProvider: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='tooltip-provider'>{children}</div>
  ),
}));

vi.mock('@/lib/admin/page-access', () => ({
  getCurrentAdminPageAccess: getCurrentAdminPageAccessMock,
}));

vi.mock('@/lib/security/development-only', () => ({
  isLocalDevelopmentAutomationRequest: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/security/require-development-only', () => ({
  requireDevelopmentOnlyPage: vi.fn(),
}));

import ExpLayout from './layout';

describe('ExpLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders every experimental route for role-authorized admins', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      userId: 'user_admin',
      isAuthenticated: true,
      hasAdminRole: true,
    });

    render(
      await ExpLayout({
        children: <div data-testid='prototype'>Prototype content</div>,
      })
    );

    expect(screen.getByTestId('prototype')).toBeVisible();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'authenticated non-admins',
      access: {
        userId: 'user_member',
        isAuthenticated: true,
        hasAdminRole: false,
      },
    },
    {
      label: 'unauthenticated visitors',
      access: {
        userId: null,
        isAuthenticated: false,
        hasAdminRole: false,
      },
    },
  ])('returns not-found before prototype data is rendered for $label', async ({
    access,
  }) => {
    getCurrentAdminPageAccessMock.mockResolvedValue(access);

    await expect(
      ExpLayout({
        children: (
          <div data-testid='prototype'>UNIQUE_PROTOTYPE_PAYLOAD_SECRET</div>
        ),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(screen.queryByText('UNIQUE_PROTOTYPE_PAYLOAD_SECRET')).toBeNull();
  });
});

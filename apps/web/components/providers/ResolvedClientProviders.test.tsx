import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';
import { getClientAuthBootstrap } from '@/lib/auth/dev-test-auth.server';

vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  getClientAuthBootstrap: vi.fn(),
}));

vi.mock('@/components/providers/ClientProviders', () => ({
  ClientProviders: ({
    children,
    authBootstrap,
  }: {
    children: ReactNode;
    authBootstrap?: { isAuthenticated?: boolean } | null;
  }) => (
    <div data-authenticated={authBootstrap?.isAuthenticated ? 'yes' : 'no'}>
      {children}
    </div>
  ),
}));

describe('ResolvedClientProviders', () => {
  it('renders children when auth bootstrap is unavailable', async () => {
    vi.mocked(getClientAuthBootstrap).mockResolvedValue(null);

    render(await ResolvedClientProviders({ children: <p>public page</p> }));

    expect(screen.getByText('public page')).toBeInTheDocument();
    expect(screen.getByText('public page').parentElement).toHaveAttribute(
      'data-authenticated',
      'no'
    );
  });

  it('passes bootstrap into ClientProviders when a session exists', async () => {
    vi.mocked(getClientAuthBootstrap).mockResolvedValue({
      isAuthenticated: true,
      userId: 'user-1',
      email: 'browse+clerk_test@jov.ie',
      username: 'browse-test-user',
      fullName: 'Browse Test User',
      isAdmin: false,
      persona: 'creator',
    });

    render(await ResolvedClientProviders({ children: <p>signed in</p> }));

    expect(screen.getByText('signed in')).toBeInTheDocument();
    expect(screen.getByText('signed in').parentElement).toHaveAttribute(
      'data-authenticated',
      'yes'
    );
  });
});

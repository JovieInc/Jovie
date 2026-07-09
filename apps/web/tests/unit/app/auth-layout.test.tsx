import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/providers/AuthClientProviders', () => ({
  AuthClientProviders: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='auth-client-providers'>{children}</div>
  ),
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagsSnapshot: vi.fn(async () => ({})),
}));

vi.mock('@/lib/flags/route-snapshots', () => ({
  resolveAuthRouteFlagNames: vi.fn(() => []),
}));

vi.mock('@/lib/flags/client', () => ({
  AppFlagProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

describe('auth route layout (Better Auth)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('renders auth children through AuthClientProviders without Clerk key gating', async () => {
    const Layout = (await import('@/app/(auth)/layout')).default;
    const ui = await Layout({ children: <span>signin-body</span> });
    render(ui);

    expect(screen.getByTestId('auth-client-providers')).toBeTruthy();
    expect(screen.getByText('signin-body')).toBeTruthy();
  });
});

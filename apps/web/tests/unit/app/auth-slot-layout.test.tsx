import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/providers/AuthClientProviders', () => ({
  AuthClientProviders: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='auth-slot-providers'>{children}</div>
  ),
}));

describe('@auth parallel slot layout (Better Auth)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('renders active auth modal children without Clerk key resolution', async () => {
    const Layout = (await import('@/app/@auth/layout')).default;
    const ui = await Layout({ children: <span>modal-auth</span> });
    render(ui);

    expect(screen.getByTestId('auth-slot-providers')).toBeTruthy();
    expect(screen.getByText('modal-auth')).toBeTruthy();
  });

  it('returns null for inactive default slot children (ISR safety)', async () => {
    const AuthSlotDefault = (await import('@/app/@auth/default')).default;
    const Layout = (await import('@/app/@auth/layout')).default;
    const ui = await Layout({ children: <AuthSlotDefault /> });
    expect(ui).toBeNull();
  });
});

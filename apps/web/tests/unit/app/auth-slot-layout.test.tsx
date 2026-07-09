import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const resolvePublishableKeyStaticFirstMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/staging-clerk-keys', () => ({
  resolvePublishableKeyStaticFirst: resolvePublishableKeyStaticFirstMock,
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    NEXT_PUBLIC_CLERK_MOCK: '0',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_example',
  },
}));

vi.mock('@/components/providers/clerkAvailability', () => ({
  isMockPublishableKey: () => false,
}));

vi.mock('@/components/providers/AuthClientProviders', () => ({
  AuthClientProviders: ({ children }: { children: ReactNode }) => (
    <div data-testid='auth-client-providers'>{children}</div>
  ),
}));

vi.mock('@/features/auth', () => ({
  AuthUnavailableCard: () => <div data-testid='auth-unavailable-card' />,
}));

vi.mock('@/components/auth/AuthModalShell', () => ({
  AuthModalShell: ({ children }: { children: ReactNode }) => (
    <div data-testid='auth-modal-shell'>{children}</div>
  ),
}));

afterEach(() => {
  vi.resetModules();
  resolvePublishableKeyStaticFirstMock.mockReset();
});

describe.skip('@auth parallel slot layout', () => {
  it('returns null for the default slot without resolving Clerk keys', async () => {
    const { default: AuthSlotDefault } = await import(
      '../../../app/@auth/default'
    );
    const { default: AuthSlotLayout } = await import(
      '../../../app/@auth/layout'
    );

    const { container: nullChildrenContainer } = render(
      await AuthSlotLayout({ children: null })
    );
    expect(nullChildrenContainer).toBeEmptyDOMElement();

    const { container: defaultSlotContainer } = render(
      await AuthSlotLayout({ children: <AuthSlotDefault /> })
    );
    expect(defaultSlotContainer).toBeEmptyDOMElement();
    expect(resolvePublishableKeyStaticFirstMock).not.toHaveBeenCalled();
  });

  it('resolves Clerk keys when intercepted auth modal children are present', async () => {
    resolvePublishableKeyStaticFirstMock.mockResolvedValue('pk_test_example');

    const { default: AuthSlotLayout } = await import(
      '../../../app/@auth/layout'
    );

    render(
      await AuthSlotLayout({
        children: <div data-testid='auth-modal-child'>modal</div>,
      })
    );

    expect(resolvePublishableKeyStaticFirstMock).toHaveBeenCalledOnce();
    expect(screen.getByTestId('auth-client-providers')).toBeInTheDocument();
    expect(screen.getByTestId('auth-modal-child')).toBeInTheDocument();
  });
});

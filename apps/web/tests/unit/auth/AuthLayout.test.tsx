import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  SignOutButton: ({ children }: { readonly children: ReactNode }) => children,
}));

vi.mock('@jovie/ui', () => ({
  DropdownMenu: ({ children }: { readonly children: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({ children }: { readonly children: ReactNode }) => (
    <button type='button'>{children}</button>
  ),
  DropdownMenuTrigger: ({
    children,
  }: {
    readonly children: ReactNode;
    readonly asChild?: boolean;
  }) => children,
}));

vi.mock('@/components/atoms/AppIconButton', () => ({
  AppIconButton: ({
    children,
    ariaLabel,
  }: {
    readonly children: ReactNode;
    readonly ariaLabel: string;
    readonly variant?: string;
  }) => (
    <button type='button' aria-label={ariaLabel}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/atoms/BrandLogo', () => ({
  BrandLogo: () => <svg aria-hidden='true' data-testid='brand-logo' />,
}));

vi.mock('@/hooks/useMobileKeyboard', () => ({
  useMobileKeyboard: () => ({ isKeyboardVisible: false }),
}));

describe('AuthLayout', () => {
  it('renders a skip link to a focusable main landmark', async () => {
    const { AuthLayout } = await import('@/features/auth/AuthLayout');

    render(
      <AuthLayout formTitle='Sign In'>
        <div>Auth form body</div>
      </AuthLayout>
    );

    expect(screen.getByRole('link', { name: 'Skip to form' })).toHaveAttribute(
      'href',
      '#auth-form'
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'auth-form');
    expect(screen.getByRole('main')).toHaveAttribute('tabIndex', '-1');
  });

  it('keeps the homepage logo link available when the logo is shown', async () => {
    const { AuthLayout } = await import('@/features/auth/AuthLayout');

    render(
      <AuthLayout formTitle='Sign In'>
        <div>Auth form body</div>
      </AuthLayout>
    );

    expect(screen.getByLabelText('Go to homepage')).toHaveAttribute(
      'href',
      '/'
    );
  });

  it('renders the footer prompt and link through the auth shell contract', async () => {
    const { AuthLayout } = await import('@/features/auth/AuthLayout');

    render(
      <AuthLayout
        formTitle='Sign In'
        footerPrompt='Need an account?'
        footerLinkText='Join now'
        footerLinkHref='/signup'
      >
        <div>Auth form body</div>
      </AuthLayout>
    );

    expect(screen.getByText('Need an account?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Join now' })).toHaveAttribute(
      'href',
      '/signup'
    );
  });

  it('renders the logout menu trigger only when enabled', async () => {
    const { AuthLayout } = await import('@/features/auth/AuthLayout');

    const { rerender } = render(
      <AuthLayout formTitle='Sign In'>
        <div>Auth form body</div>
      </AuthLayout>
    );

    expect(
      screen.queryByRole('button', { name: 'Open menu' })
    ).not.toBeInTheDocument();

    rerender(
      <AuthLayout formTitle='Sign In' showLogoutButton>
        <div>Auth form body</div>
      </AuthLayout>
    );

    expect(
      screen.getByRole('button', { name: 'Open menu' })
    ).toBeInTheDocument();
  });

  it('keeps the split auth rail mounted when the split layout variant is used', async () => {
    const { AuthLayout } = await import('@/features/auth/AuthLayout');

    render(
      <AuthLayout formTitle='Sign In' layoutVariant='split'>
        <div>Auth form body</div>
      </AuthLayout>
    );

    expect(document.querySelector('.auth-showcase-panel')).not.toBeNull();
  });
});

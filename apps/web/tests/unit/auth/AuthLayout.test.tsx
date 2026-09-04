import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let keyboardVisible = false;

vi.mock('@clerk/nextjs', () => ({
  SignOutButton: ({ children }: { readonly children: ReactNode }) => children,
}));

vi.mock('@jovie/ui', () => ({
  Button: ({ children }: { readonly children: ReactNode }) => (
    <button type='button'>{children}</button>
  ),
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
  useMobileKeyboard: () => ({ isKeyboardVisible: keyboardVisible }),
}));

import { AuthLayout } from '@/components/features/auth/AuthLayout';

describe('AuthLayout', () => {
  beforeEach(() => {
    keyboardVisible = false;
  });

  it('renders a skip link to a focusable main landmark', async () => {
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
    render(
      <AuthLayout formTitle='Sign In'>
        <div>Auth form body</div>
      </AuthLayout>
    );

    expect(screen.getByLabelText('Go to homepage')).toHaveAttribute(
      'href',
      '/'
    );
    expect(screen.getByLabelText('Go to homepage')).toHaveClass('size-11');
  });

  it('keeps the footer prompt opt-in through the auth shell contract', async () => {
    render(
      <AuthLayout
        formTitle='Sign In'
        footerPrompt='Need an account?'
        footerLinkText='Join now'
        footerLinkHref='/signup'
        showFooterPrompt
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
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('keeps the split auth rail mounted when the split layout variant is used', async () => {
    render(
      <AuthLayout formTitle='Sign In' layoutVariant='split'>
        <div>Auth form body</div>
      </AuthLayout>
    );

    expect(document.querySelector('.auth-showcase-panel')).not.toBeNull();
    expect(
      document.querySelector('[data-auth-editorial-card="desktop-only"]')
    ).not.toBeNull();
    expect(document.querySelector('[data-auth-shell]')).toHaveAttribute(
      'data-auth-shell-kind',
      'desktop-split-route'
    );
    expect(document.querySelector('.auth-desktop-only')).not.toBeNull();
  });

  it('keeps legal disclosure in document flow so it cannot overlay Need help', async () => {
    const { container } = render(
      <AuthLayout formTitle='Sign In' layoutVariant='split'>
        <p data-auth-legal-copy>Legal disclosure</p>
      </AuthLayout>
    );

    expect(container.innerHTML).not.toContain(
      'lg:[&_[data-auth-legal-copy]]:absolute'
    );
    expect(screen.getByText('Legal disclosure')).toBeInTheDocument();
  });

  it('centers the 32px mark on splash-B chrome without film grain', async () => {
    const { container } = render(
      <AuthLayout formTitle='Sign In' chrome='splash-b'>
        <div>Auth form body</div>
      </AuthLayout>
    );

    expect(
      container.querySelector('[data-auth-chrome="splash-b"]')
    ).not.toBeNull();
    expect(container.querySelector('.auth-shell-grain')).toBeNull();
    expect(container.querySelector('.auth-showcase-panel')).toBeNull();
    expect(screen.getByLabelText('Go to homepage')).toBeInTheDocument();
  });

  it('keeps default stack placement distinct from centered stack placement', async () => {
    const { container, rerender } = render(
      <AuthLayout formTitle='Sign In' layoutVariant='stack'>
        <div>Auth form body</div>
      </AuthLayout>
    );

    const defaultColumn = container.querySelector('[data-auth-form-column]');
    expect(defaultColumn).not.toBeNull();
    expect(defaultColumn).toHaveClass('justify-start');
    expect(defaultColumn).not.toHaveClass('justify-center');

    rerender(
      <AuthLayout
        formTitle='Sign In'
        layoutVariant='stack'
        contentPlacement='center'
      >
        <div>Auth form body</div>
      </AuthLayout>
    );

    const centeredColumn = container.querySelector('[data-auth-form-column]');
    expect(centeredColumn).not.toBeNull();
    expect(centeredColumn).toHaveClass('justify-center');
  });

  it('reserves the splash-B logo slot while the mobile keyboard is visible', async () => {
    keyboardVisible = true;
    const { container } = render(
      <AuthLayout formTitle='Sign In' chrome='splash-b'>
        <div>Auth form body</div>
      </AuthLayout>
    );

    const slot = container.querySelector('[data-auth-splash-logo-slot]');
    expect(slot).not.toBeNull();
    expect(slot).toHaveClass('size-11');
    const logoLink = container.querySelector('[data-auth-splash-logo-slot] a');
    expect(logoLink).not.toBeNull();
    expect(logoLink).toHaveAttribute('aria-hidden', 'true');
    expect(logoLink).toHaveAttribute('tabIndex', '-1');
    expect(logoLink).toHaveClass('opacity-0');
  });

  it('hides non-form chrome while the mobile keyboard is visible', async () => {
    keyboardVisible = true;
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

    const logoLink = screen.getByLabelText('Go to homepage');
    expect(logoLink).toHaveAttribute('tabIndex', '-1');
    expect(screen.getByRole('heading', { hidden: true })).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(screen.queryByText('Need an account?')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Auth form body');
  });
});

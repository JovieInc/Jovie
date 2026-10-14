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

vi.mock('@/components/providers/AuthClientProviders', () => ({
  AuthClientProviders: ({ children }: { readonly children: ReactNode }) =>
    children,
}));

vi.mock('@/components/providers/ResolvedClientProviders', () => ({
  ResolvedClientProviders: ({ children }: { readonly children: ReactNode }) =>
    children,
}));

vi.mock('@/lib/flags/client', () => ({
  AppFlagProvider: ({ children }: { readonly children: ReactNode }) => children,
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagsSnapshot: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/components/molecules/LoadingSkeleton', () => ({
  AuthFormSkeleton: () => <div>Loading auth form</div>,
}));

import AuthRouteLayout from '@/app/(auth)/layout';
import ErrorPageLoading from '@/app/error/user-creation-failed/loading';
import UserCreationFailedPage from '@/app/error/user-creation-failed/page';
import OnboardingCheckoutLoading from '@/app/onboarding/checkout/loading';
import WaitlistRouteLayout from '@/app/waitlist/layout';
import { AuthLayout } from '@/components/features/auth/AuthLayout';
import { WaitlistInviteMessage } from '@/components/features/waitlist/WaitlistInviteMessage';

describe('AuthLayout', () => {
  beforeEach(() => {
    keyboardVisible = false;
  });

  it('provides a focusable form container without owning the route landmark', () => {
    const { container } = render(
      <AuthLayout formTitle='Sign In'>
        <div>Auth form body</div>
      </AuthLayout>
    );

    expect(screen.getByRole('link', { name: 'Skip to form' })).toHaveAttribute(
      'href',
      '#auth-form'
    );
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(container.querySelector('#auth-form')).toHaveAttribute(
      'tabIndex',
      '-1'
    );
  });

  it('keeps one main landmark in the actual auth route composition', async () => {
    render(
      await AuthRouteLayout({
        children: (
          <AuthLayout formTitle='Sign In'>
            <div>Auth form body</div>
          </AuthLayout>
        ),
      })
    );

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toHaveTextContent('Auth form body');
  });

  it('keeps one main landmark in the standalone waitlist route', async () => {
    render(
      await WaitlistRouteLayout({
        children: (
          <AuthLayout formTitle='Continue to Jovie'>
            <div>Waitlist form body</div>
          </AuthLayout>
        ),
      })
    );

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toHaveTextContent('Waitlist form body');
  });

  it('keeps one main landmark on account-creation recovery', () => {
    render(<UserCreationFailedPage />);

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toHaveTextContent('Account setup error');
  });

  it('keeps one main landmark around waitlist invite recovery', async () => {
    render(
      await WaitlistRouteLayout({
        children: (
          <WaitlistInviteMessage
            title='Invite link missing'
            body='Open the latest invite email and try again.'
          />
        ),
      })
    );

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toHaveTextContent('Invite link missing');
  });

  it.each([
    ['account recovery', ErrorPageLoading],
    ['onboarding checkout', OnboardingCheckoutLoading],
  ])('keeps one main landmark while standalone %s loads', (_, Loading) => {
    render(<Loading />);

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toHaveTextContent('Loading auth form');
  });

  it('keeps the homepage logo link available when the split rail is shown', async () => {
    render(
      <AuthLayout formTitle='Sign In' layoutVariant='split'>
        <div>Auth form body</div>
      </AuthLayout>
    );

    expect(screen.getByLabelText('Go to homepage')).toHaveAttribute(
      'href',
      '/'
    );
    expect(screen.getByLabelText('Go to homepage')).toHaveClass('size-5');
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

  it('keeps splash-B chrome free of film grain and editorial cards', async () => {
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
    expect(defaultColumn).toHaveClass('auth-form-stack-offset');
    expect(defaultColumn).not.toHaveClass('justify-center');
    expect(container.querySelector('[data-auth-shell]')).not.toHaveAttribute(
      'data-auth-keyboard-visible'
    );

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
    expect(slot).toHaveClass('h-8');
    const logoLink = container.querySelector('[data-auth-splash-logo-slot] a');
    expect(logoLink).not.toBeNull();
    expect(logoLink).toHaveAttribute('aria-hidden', 'true');
    expect(logoLink).toHaveAttribute('tabIndex', '-1');
    expect(logoLink).toHaveClass('opacity-0');
  });

  it('marks the shell when the mobile keyboard is visible', async () => {
    keyboardVisible = true;
    const { container } = render(
      <AuthLayout formTitle='Sign In'>
        <div>Auth form body</div>
      </AuthLayout>
    );

    expect(container.querySelector('[data-auth-shell]')).toHaveAttribute(
      'data-auth-keyboard-visible'
    );
    expect(container.querySelector('[data-auth-form-column]')).toHaveClass(
      'auth-form-stack-offset'
    );
  });

  it('hides non-form chrome while the mobile keyboard is visible', async () => {
    keyboardVisible = true;
    render(
      <AuthLayout
        formTitle='Sign In'
        layoutVariant='split'
        footerPrompt='Need an account?'
        footerLinkText='Join now'
        footerLinkHref='/signup'
      >
        <div>Auth form body</div>
      </AuthLayout>
    );

    const logoLink = screen.getByLabelText('Go to homepage');
    expect(logoLink).toHaveAttribute('tabIndex', '-1');
    const hiddenTitle = document.querySelector('h1');
    expect(hiddenTitle).toHaveTextContent('Sign In');
    expect(hiddenTitle).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText('Need an account?')).not.toBeInTheDocument();
    expect(screen.getByText('Auth form body')).toBeVisible();
  });

  it('hides shared-shell chrome while the mobile keyboard is visible', async () => {
    keyboardVisible = true;
    const { container } = render(
      <AuthLayout formTitle='Log in to Jovie' showFormTitle={false}>
        <div data-auth-shell-identity>Identity</div>
        <button type='submit'>Send sign-in code</button>
      </AuthLayout>
    );

    expect(
      container.querySelector('[data-auth-form-column]')?.className
    ).toContain('[&_[data-auth-shell-identity]]:hidden');
    expect(
      screen.getByRole('button', { name: 'Send sign-in code' })
    ).toBeVisible();
  });
});

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AuthProviderButtonSlot,
  AuthProviderButtonSlots,
} from '@/components/features/auth/AuthProviderButtons';
import { getEnabledAuthOAuthProviders } from '@/lib/auth/oauth-providers';

describe('AuthProviderButtonSlots', () => {
  it('renders the shared full provider labels', () => {
    render(
      <AuthProviderButtonSlots providers={getEnabledAuthOAuthProviders()} />
    );

    const slots = screen
      .getByText('Loading social sign-in options')
      .closest('fieldset');
    expect(slots).not.toBeNull();
    expect(slots).toHaveClass('gap-3');
    expect(
      within(slots!).getByRole('button', {
        name: 'Continue with Google loading',
      })
    ).toBeDisabled();
    expect(
      within(slots!).getByRole('button', {
        name: 'Continue with Apple loading',
      })
    ).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Google$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Apple$/ })).toBeNull();
  });

  it('uses the same label when a provider button is enabled', () => {
    render(<AuthProviderButtonSlot disabled={false} provider='google' />);

    expect(
      screen.getByRole('button', { name: 'Continue with Google' })
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }).className
    ).toContain('bg-transparent');
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }).className
    ).toContain('h-7');
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }).className
    ).toContain('min-h-7');
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }).className
    ).toContain('gap-(--space-2)');
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }).className
    ).not.toContain('--linear-gap-');
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }).className
    ).toContain('before:h-11');
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }).className
    ).toContain('before:min-w-11');
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }).className
    ).not.toContain('--linear-shadow-button');
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }).className
    ).not.toContain('--linear-button-height-md');
  });

  it('balances Apple and Google on the same dark 28/44 treatment and official Google G', () => {
    const { container } = render(
      <>
        <AuthProviderButtonSlot disabled={false} provider='apple' />
        <AuthProviderButtonSlot disabled={false} provider='google' />
      </>
    );
    for (const name of [
      'Continue with Apple',
      'Continue with Google',
    ] as const) {
      const className = screen.getByRole('button', { name }).className;
      expect(className).toContain('h-7');
      expect(className).toContain('before:h-11');
      expect(className).toContain('bg-transparent');
    }
    expect(
      container.querySelector('[data-auth-google-icon="full-color"]')
    ).not.toBeNull();
    expect(container.querySelector('path[fill="#4285F4"]')).not.toBeNull();
  });
});

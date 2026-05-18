import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AuthProviderButtonSlot,
  AuthProviderButtonSlots,
} from '@/features/auth';
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
  });
});

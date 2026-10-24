import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SocialAuthButton } from '@/components/atoms/SocialAuthButton';
import {
  AuthProviderButtonSlot,
  AuthProviderButtonSlots,
} from '@/components/features/auth/AuthProviderButtons';
import { preserveAuthTouchOwnership } from '@/components/features/auth/constants';
import { getEnabledAuthOAuthProviders } from '@/lib/auth/oauth-providers';

describe('SocialAuthButton', () => {
  it.each([
    ['apple', 'Continue with Apple'],
    ['google', 'Continue with Google'],
  ] as const)('starts %s sign-in when enabled', (provider, label) => {
    const onClick = vi.fn();
    render(
      <SocialAuthButton
        provider={provider}
        disabled={false}
        onClick={onClick}
      />
    );

    const button = screen.getByRole('button', { name: label });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('type', 'button');
    expect(button.querySelector('img')).toHaveAttribute(
      'src',
      `/auth/${provider}-logo.svg`
    );
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it.each([
    ['apple', 'Continue with Apple loading'],
    ['google', 'Continue with Google loading'],
  ] as const)(
    'prevents another %s sign-in while pending',
    (provider, label) => {
      const onClick = vi.fn();
      render(
        <SocialAuthButton
          provider={provider}
          disabled={false}
          pending
          onClick={onClick}
        />
      );

      const button = screen.getByRole('button', { name: label });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('data-auth-provider-pending', 'true');
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, true])(
    'prevents sign-in when disabled is %s',
    disabled => {
      const onClick = vi.fn();
      render(
        <SocialAuthButton
          provider='google'
          disabled={disabled}
          onClick={onClick}
        />
      );

      const button = screen.getByRole('button', {
        name: 'Continue with Google',
      });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    }
  );
});

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
        name: 'Continue with Google',
      })
    ).toBeDisabled();
    expect(
      within(slots!).getByRole('button', {
        name: 'Continue with Apple',
      })
    ).toBeDisabled();
    expect(
      within(slots!).getByRole('button', { name: 'Continue with Google' })
    ).not.toHaveClass('opacity-75');
    expect(screen.queryByRole('button', { name: /^Google$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Apple$/ })).toBeNull();
  });

  it('dims and renames only the provider that is actually pending', () => {
    render(<AuthProviderButtonSlot provider='google' pending />);

    const button = screen.getByRole('button', {
      name: 'Continue with Google loading',
    });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('opacity-75');
    expect(button).toHaveAttribute('data-auth-provider-pending', 'true');
  });

  it('uses the same label when a provider button is enabled', () => {
    render(<AuthProviderButtonSlot disabled={false} provider='google' />);

    expect(
      screen.getByRole('button', { name: 'Continue with Google' })
    ).toBeEnabled();
    expect(screen.getByRole('button').querySelector('img')).toHaveAttribute(
      'src',
      '/auth/google-logo.svg'
    );
  });

  it('cancels touches retargeted from whitespace while accepting owned points', () => {
    render(
      <div onTouchEndCapture={preserveAuthTouchOwnership}>
        <AuthProviderButtonSlot disabled={false} provider='apple' />
      </div>
    );
    const button = screen.getByRole('button');
    expect(button.querySelector('img')).toHaveAttribute(
      'src',
      '/auth/apple-logo.svg'
    );
    const touch = { changedTouches: [{ clientX: 10, clientY: 10 }] };
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => document.body,
    });
    expect(fireEvent.touchEnd(button, touch)).toBe(false);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => button,
    });
    expect(fireEvent.touchEnd(button, touch)).toBe(true);
    expect(fireEvent.touchEnd(button, { changedTouches: [] })).toBe(true);
    delete (document as Partial<Document>).elementFromPoint;
  });
});

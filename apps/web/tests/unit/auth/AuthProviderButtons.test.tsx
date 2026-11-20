import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AuthProviderButtonSlot,
  AuthProviderButtonSlots,
} from '@/components/features/auth/AuthProviderButtons';
import { preserveAuthTouchOwnership } from '@/components/features/auth/constants';
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
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
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

  it('renders Apple and Google through identical classes and icon box', () => {
    render(
      <AuthProviderButtonSlots providers={getEnabledAuthOAuthProviders()} />
    );
    const google = screen.getByRole('button', { name: 'Continue with Google' });
    const apple = screen.getByRole('button', { name: 'Continue with Apple' });
    expect(apple.className).toBe(google.className);
    const gi = google.querySelector('[data-auth-provider-face] img')!;
    const ai = apple.querySelector('[data-auth-provider-face] svg')!;
    expect(ai.getAttribute('width')).toBe('16');
    expect(gi.getAttribute('width')).toBe('16');
    expect(ai.getAttribute('height')).toBe(gi.getAttribute('height'));
    expect(apple.querySelector('[data-auth-provider-face]')?.className).toBe(
      google.querySelector('[data-auth-provider-face]')?.className
    );
  });

  it('lists Google before Apple, as Pen oaz9c does', () => {
    render(
      <AuthProviderButtonSlots providers={getEnabledAuthOAuthProviders()} />
    );
    expect(
      screen.getAllByRole('button').map(b => b.dataset.authProviderSlot)
    ).toEqual(['google', 'apple']);
  });

  it('pins the Pen oaz9c 28px face with a visible hairline', () => {
    const css = readFileSync(join(process.cwd(), 'styles/theme.css'), 'utf8');
    const face = css.match(/\n\.auth-provider-face \{([^}]*)\}/)?.[1] ?? '';

    expect(face).toMatch(/min-height: 28px;/);
    expect(face).toMatch(/padding: 0 16px;/);
    // The transparent pill has no fill, so the subtle hairline vanished.
    expect(face).toMatch(/border: 1px solid var\(--color-border-default\);/);
    expect(face).not.toMatch(/--color-border-subtle/);
  });

  it('keeps type and geometry shared in theme.css, not per provider', () => {
    const css = readFileSync(join(process.cwd(), 'styles/theme.css'), 'utf8');
    const rules = [
      ...css.matchAll(
        /\.auth-provider-button\[data-auth-provider-slot[^{]*\{([^}]*)\}/g
      ),
    ].map(m => m[1]);
    for (const body of rules) {
      expect(body).not.toMatch(/font|border|min-height|padding|gap/);
    }
  });
});

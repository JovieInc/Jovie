import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/auth', () => ({
  AuthLayout: ({
    children,
    layoutVariant,
  }: {
    readonly children: React.ReactNode;
    readonly layoutVariant?: string;
  }) => <div data-layout-variant={layoutVariant}>{children}</div>,
  AuthShell: ({
    mode,
    fallbackRedirectUrl,
    suppressOneTap,
  }: {
    readonly mode: string;
    readonly fallbackRedirectUrl?: string;
    readonly suppressOneTap?: boolean;
  }) => (
    <div
      data-testid='auth-shell'
      data-mode={mode}
      data-fallback-redirect={fallbackRedirectUrl}
      data-suppress-one-tap={suppressOneTap ? 'true' : 'false'}
    />
  ),
}));

import { WaitlistEntryView } from './WaitlistEntryView';

describe('WaitlistEntryView', () => {
  it('keeps the CTA landing on /waitlist before continuing auth into intake', () => {
    const { container } = render(<WaitlistEntryView />);

    expect(container.firstChild).toHaveAttribute(
      'data-layout-variant',
      'split'
    );
    expect(screen.getByTestId('auth-shell')).toHaveAttribute(
      'data-mode',
      'sign-up'
    );
    expect(screen.getByTestId('auth-shell')).toHaveAttribute(
      'data-fallback-redirect',
      '/start'
    );
    expect(screen.getByTestId('auth-shell')).toHaveAttribute(
      'data-suppress-one-tap',
      'true'
    );
  });
});

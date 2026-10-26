import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChangelogEmailSignup } from '@/app/(marketing)/changelog/ChangelogEmailSignup';

/**
 * Defect: every marketing page that carries the email signup (24 of them)
 * loaded the Cloudflare Turnstile script on page load, which logged a CSP
 * console error (connect-src blocks its data:, probe) and cost third-party
 * script weight for visitors who never touch the form. The e2e route-health
 * gate cannot see it because Turnstile is bypassed under E2E mode, so this
 * hermetic test models a production client (configured, not bypassed).
 */
vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

vi.mock('@/components/atoms/InvisibleTurnstile', () => ({
  InvisibleTurnstile: () => <span data-testid='turnstile-mounted' />,
  isTurnstileClientBypassed: () => false,
  isTurnstileClientConfigured: () => true,
}));

describe('email signup loads Turnstile only on intent to submit', () => {
  it('does not mount Turnstile on page load', () => {
    render(<ChangelogEmailSignup />);
    expect(screen.queryByTestId('turnstile-mounted')).toBeNull();
  });

  it('mounts Turnstile once the visitor focuses the form', () => {
    render(<ChangelogEmailSignup />);
    fireEvent.focus(screen.getByLabelText('Email Address'));
    expect(screen.getByTestId('turnstile-mounted')).toBeInTheDocument();
  });

  it.each(['pointerEnter', 'touchStart'] as const)(
    'mounts Turnstile on %s intent as well',
    intent => {
      render(<ChangelogEmailSignup />);
      expect(screen.queryByTestId('turnstile-mounted')).toBeNull();
      fireEvent[intent](screen.getByTestId('changelog-subscribe-form'));
      expect(screen.getByTestId('turnstile-mounted')).toBeInTheDocument();
    }
  );
});

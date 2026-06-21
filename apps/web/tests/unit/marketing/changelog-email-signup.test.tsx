import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangelogEmailSignup } from '@/app/(marketing)/changelog/ChangelogEmailSignup';

const turnstileMock = vi.hoisted(() => ({
  provideToken: true,
}));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

vi.mock('@/components/atoms/InvisibleTurnstile', () => ({
  InvisibleTurnstile: ({
    onToken,
  }: {
    readonly onToken: (token: string) => void;
  }) => {
    useEffect(() => {
      if (turnstileMock.provideToken) {
        onToken('test-turnstile-token');
      }
    }, [onToken]);
    return null;
  },
  isTurnstileClientBypassed: () => false,
  isTurnstileClientConfigured: () => true,
}));

describe('ChangelogEmailSignup', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    turnstileMock.provideToken = true;
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('expands the composer when the CTA button is clicked', async () => {
    const { container } = render(<ChangelogEmailSignup />);
    const revealRoot = container.querySelector("[data-ui='cta-reveal']");
    expect(revealRoot).toHaveAttribute('data-visual-state', 'collapsed');

    fireEvent.click(screen.getByTestId('changelog-reveal-button'));

    expect(revealRoot).toHaveAttribute('data-visual-state', 'expanded');
    await waitFor(() => {
      expect(screen.getByPlaceholderText('you@example.com')).toHaveFocus();
    });
  });

  it('collapses back to the CTA when the expanded shell blurs with an empty email', async () => {
    const { container } = render(<ChangelogEmailSignup />);
    const revealRoot = container.querySelector("[data-ui='cta-reveal']");
    const outsideButton = document.createElement('button');
    document.body.appendChild(outsideButton);

    fireEvent.click(screen.getByTestId('changelog-reveal-button'));

    const input = screen.getByPlaceholderText('you@example.com');
    await waitFor(() => {
      expect(input).toHaveFocus();
    });
    outsideButton.focus();

    await waitFor(() => {
      expect(revealRoot).toHaveAttribute('data-visual-state', 'collapsed');
    });

    outsideButton.remove();
  });

  it('keeps the shell open and shows the success state after submit', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'ok' }),
    } as Response);

    render(<ChangelogEmailSignup />);

    fireEvent.click(screen.getByTestId('changelog-reveal-button'));

    const input = screen.getByPlaceholderText('you@example.com');
    fireEvent.change(input, { target: { value: 'test@example.com' } });

    const form = screen.getByTestId('changelog-reveal-form');
    await waitFor(() => {
      expect(
        within(form).getByRole('button', { name: 'Subscribe' })
      ).not.toBeDisabled();
    });

    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByTestId('changelog-success-message')).toBeVisible();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/changelog/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        turnstileToken: 'test-turnstile-token',
        source: 'changelog_page',
      }),
    });
  });

  it('does not submit an empty turnstile token when verification is required', async () => {
    turnstileMock.provideToken = false;

    render(<ChangelogEmailSignup />);

    fireEvent.click(screen.getByTestId('changelog-reveal-button'));

    const input = screen.getByPlaceholderText('you@example.com');
    fireEvent.change(input, { target: { value: 'test@example.com' } });
    fireEvent.submit(screen.getByTestId('changelog-reveal-form'));

    await waitFor(() => {
      expect(
        screen.getByText('Security check is still loading. Please try again.')
      ).toBeVisible();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

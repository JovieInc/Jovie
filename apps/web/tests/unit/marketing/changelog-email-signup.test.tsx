import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  act,
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
  failureMessage: null as string | null,
  effectCount: 0,
  unmountCount: 0,
  onToken: null as ((token: string) => void) | null,
  onStateChange: null as
    | ((state: {
        readonly status: 'verified' | 'error' | 'interactive';
        readonly message?: string;
      }) => void)
    | null,
}));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

vi.mock('@/components/atoms/InvisibleTurnstile', () => ({
  InvisibleTurnstile: ({
    onToken,
    onStateChange,
  }: {
    readonly onToken: (token: string) => void;
    readonly onStateChange?: (state: {
      readonly status: 'verified' | 'error' | 'interactive';
      readonly message?: string;
    }) => void;
  }) => {
    useEffect(() => {
      turnstileMock.effectCount += 1;
      turnstileMock.onToken = onToken;
      turnstileMock.onStateChange = onStateChange ?? null;
      if (turnstileMock.failureMessage) {
        onStateChange?.({
          status: 'error',
          message: turnstileMock.failureMessage,
        });
        return;
      }
      if (turnstileMock.provideToken) {
        onToken('test-turnstile-token');
        onStateChange?.({ status: 'verified' });
      }
      return () => {
        turnstileMock.unmountCount += 1;
        turnstileMock.onToken = null;
        turnstileMock.onStateChange = null;
      };
    }, [onStateChange, onToken]);
    return null;
  },
  isTurnstileClientBypassed: () => false,
  isTurnstileClientConfigured: () => true,
}));

describe('ChangelogEmailSignup', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    turnstileMock.provideToken = true;
    turnstileMock.failureMessage = null;
    turnstileMock.effectCount = 0;
    turnstileMock.unmountCount = 0;
    turnstileMock.onToken = null;
    turnstileMock.onStateChange = null;
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

  it('keeps the Turnstile lifecycle stable while the parent rerenders', async () => {
    render(<ChangelogEmailSignup />);

    await waitFor(() => expect(turnstileMock.effectCount).toBe(1));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'artist@example.com' },
    });

    expect(turnstileMock.effectCount).toBe(1);
  });

  it('expands without stealing focus when Turnstile requires interaction', async () => {
    const { container } = render(<ChangelogEmailSignup />);
    const revealRoot = container.querySelector("[data-ui='cta-reveal']");
    const input = screen.getByPlaceholderText('you@example.com');

    act(() => turnstileMock.onStateChange?.({ status: 'interactive' }));
    await act(async () => {
      await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    });

    expect(revealRoot).toHaveAttribute('data-visual-state', 'expanded');
    expect(input).not.toHaveFocus();
  });

  it('preserves a Turnstile failure that arrives during blur collapse', async () => {
    render(<ChangelogEmailSignup />);
    const outsideButton = document.createElement('button');
    document.body.appendChild(outsideButton);

    fireEvent.click(screen.getByTestId('changelog-reveal-button'));
    const input = screen.getByPlaceholderText('you@example.com');
    await waitFor(() => expect(input).toHaveFocus());

    outsideButton.focus();
    act(() => {
      turnstileMock.onToken?.('');
      turnstileMock.onStateChange?.({
        status: 'error',
        message: 'Security check could not load.',
      });
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Security check could not load.'
    );
    expect(screen.getByTestId('changelog-reveal-form')).toBeVisible();

    outsideButton.remove();
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
    await waitFor(() => expect(turnstileMock.unmountCount).toBe(1));
    expect(turnstileMock.onStateChange).toBeNull();

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

  it('surfaces challenge unavailability as an accessible failure state', async () => {
    turnstileMock.provideToken = false;
    turnstileMock.failureMessage =
      'Security check could not load. Refresh the page and try again.';

    render(<ChangelogEmailSignup />);

    fireEvent.click(screen.getByTestId('changelog-reveal-button'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(turnstileMock.failureMessage);
    expect(
      within(screen.getByTestId('changelog-reveal-form')).getByRole('button', {
        name: 'Subscribe',
      })
    ).toBeDisabled();
    expect(screen.getByPlaceholderText('you@example.com')).toHaveAttribute(
      'aria-describedby',
      'changelog-subscribe-status'
    );
    expect(screen.getByPlaceholderText('you@example.com')).not.toHaveAttribute(
      'aria-invalid'
    );

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'artist@example.com' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      turnstileMock.failureMessage
    );
    expect(
      within(screen.getByTestId('changelog-reveal-form')).getByRole('button', {
        name: 'Subscribe',
      })
    ).toBeDisabled();

    act(() => {
      turnstileMock.onToken?.('recovered-turnstile-token');
      turnstileMock.onStateChange?.({ status: 'verified' });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('changelog-reveal-form')).getByRole('button', {
        name: 'Subscribe',
      })
    ).toBeEnabled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reserves two mobile lines for accessible security failures', () => {
    const globalsCss = readFileSync(
      resolve(process.cwd(), 'app/globals.css'),
      'utf8'
    );

    expect(globalsCss).toMatch(
      /\[data-ui="cta-reveal"\] \.cta-reveal-support \{[\s\S]*?min-height: 40px;/
    );
    expect(globalsCss).toMatch(
      /@media \(min-width: 640px\) \{[\s\S]*?\.cta-reveal-support \{[\s\S]*?min-height: 20px;/
    );
  });
});

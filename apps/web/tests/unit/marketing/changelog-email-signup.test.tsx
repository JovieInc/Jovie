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

  it('renders one compact subscribe form without a duplicate reveal CTA', () => {
    const { container } = render(<ChangelogEmailSignup />);
    const revealRoot = container.querySelector("[data-ui='cta-reveal']");
    expect(revealRoot).toHaveAttribute('data-visual-state', 'expanded');

    expect(screen.getByText('Get the good stuff')).toBeVisible();
    expect(
      screen.getByText('Occasional meaningful updates — not every deploy.')
    ).toBeVisible();
    expect(
      screen.queryByTestId('changelog-reveal-button')
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Subscribe' })).toHaveLength(
      1
    );
    expect(screen.getByPlaceholderText('you@example.com')).toBeVisible();
  });

  it('keeps the Turnstile lifecycle stable while the parent rerenders', async () => {
    render(<ChangelogEmailSignup />);

    await waitFor(() => expect(turnstileMock.effectCount).toBe(1));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'artist@example.com' },
    });

    expect(turnstileMock.effectCount).toBe(1);
  });

  it('does not steal focus when Turnstile requires interaction', async () => {
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

  it('preserves a Turnstile failure while the compact form stays open', async () => {
    render(<ChangelogEmailSignup />);

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
    expect(screen.getByTestId('changelog-subscribe-form')).toBeVisible();
  });

  it('keeps the shell open and shows the success state after submit', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'ok' }),
    } as Response);

    render(<ChangelogEmailSignup />);

    const input = screen.getByPlaceholderText('you@example.com');
    fireEvent.change(input, { target: { value: 'test@example.com' } });

    const form = screen.getByTestId('changelog-subscribe-form');
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

    const input = screen.getByPlaceholderText('you@example.com');
    fireEvent.change(input, { target: { value: 'test@example.com' } });
    fireEvent.submit(screen.getByTestId('changelog-subscribe-form'));

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

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(turnstileMock.failureMessage);
    expect(
      within(screen.getByTestId('changelog-subscribe-form')).getByRole(
        'button',
        {
          name: 'Subscribe',
        }
      )
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
      within(screen.getByTestId('changelog-subscribe-form')).getByRole(
        'button',
        {
          name: 'Subscribe',
        }
      )
    ).toBeDisabled();

    act(() => {
      turnstileMock.onToken?.('recovered-turnstile-token');
      turnstileMock.onStateChange?.({ status: 'verified' });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('changelog-subscribe-form')).getByRole(
        'button',
        {
          name: 'Subscribe',
        }
      )
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

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
  resetSignal: 0,
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
    resetSignal,
  }: {
    readonly onToken: (token: string) => void;
    readonly resetSignal?: number;
    readonly onStateChange?: (state: {
      readonly status: 'verified' | 'error' | 'interactive';
      readonly message?: string;
    }) => void;
  }) => {
    turnstileMock.resetSignal = resetSignal ?? 0;
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
    // A reset signal re-executes the real widget and delivers a fresh token.
    useEffect(() => {
      if (
        (resetSignal ?? 0) > 0 &&
        turnstileMock.provideToken &&
        !turnstileMock.failureMessage
      ) {
        onToken('test-turnstile-token');
      }
    }, [resetSignal, onToken]);
    return null;
  },
  isTurnstileClientBypassed: () => false,
  isTurnstileClientConfigured: () => true,
}));

describe('ChangelogEmailSignup', () => {
  it('binds the shared marketing opt-in on its actual semantic root', () => {
    const { unmount } = render(
      <ChangelogEmailSignup source='marketing:/pricing' marketingSection />
    );
    const root = screen.getByTestId('marketing-section-capture');
    expect(root.tagName).toBe('SECTION');
    expect(root).toHaveAttribute('data-marketing-variant', 'email-only');
    expect(root).toHaveAttribute(
      'data-marketing-occurrence',
      'product-updates'
    );
    expect(root).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/app/(marketing)/changelog/ChangelogEmailSignup.tsx'
    );
    unmount();
    render(<ChangelogEmailSignup />);
    expect(screen.queryByTestId('marketing-section-capture')).toBeNull();
  });

  const originalFetch = global.fetch;

  beforeEach(() => {
    turnstileMock.provideToken = true;
    turnstileMock.failureMessage = null;
    turnstileMock.effectCount = 0;
    turnstileMock.unmountCount = 0;
    turnstileMock.resetSignal = 0;
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
    const revealRoot = container.querySelector("[data-pen-source='qKrDn']");
    expect(revealRoot).toHaveAttribute('data-visual-state', 'idle');

    expect(screen.getByText('Get product updates')).toBeVisible();
    expect(
      screen.getByText('New features and improvements from Jovie.')
    ).toBeVisible();
    expect(
      screen.queryByTestId('changelog-reveal-button')
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Subscribe' })).toHaveLength(
      1
    );
    expect(screen.getByPlaceholderText('you@email.com')).toBeVisible();
  });

  it('keeps the Turnstile lifecycle stable while the parent rerenders', async () => {
    render(<ChangelogEmailSignup />);

    await waitFor(() => expect(turnstileMock.effectCount).toBe(1));
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), {
      target: { value: 'artist@example.com' },
    });

    expect(turnstileMock.effectCount).toBe(1);
  });

  it('does not steal focus when Turnstile requires interaction', async () => {
    const { container } = render(<ChangelogEmailSignup />);
    const revealRoot = container.querySelector("[data-pen-source='qKrDn']");
    const input = screen.getByPlaceholderText('you@email.com');

    act(() => turnstileMock.onStateChange?.({ status: 'interactive' }));
    await act(async () => {
      await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    });

    expect(revealRoot).toHaveAttribute('data-visual-state', 'idle');
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
      json: async () => ({ state: 'confirmation_required' }),
    } as Response);

    render(<ChangelogEmailSignup />);

    const input = screen.getByPlaceholderText('you@email.com');
    fireEvent.change(input, { target: { value: 'test@example.com' } });

    const form = screen.getByTestId('changelog-subscribe-form');
    await waitFor(() => {
      expect(
        within(form).getByRole('button', { name: 'Subscribe' })
      ).not.toBeDisabled();
    });

    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Check your email' })
      ).toBeVisible();
      expect(screen.getByTestId('changelog-success-message')).toHaveTextContent(
        'Confirm your subscription to receive Jovie changelog emails.'
      );
    });
    // The widget stays mounted in the confirmation-required state so the
    // resend action can reuse a fresh security token.
    expect(turnstileMock.unmountCount).toBe(0);
    expect(turnstileMock.onStateChange).not.toBeNull();

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

    const input = screen.getByPlaceholderText('you@email.com');
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
    expect(screen.getByPlaceholderText('you@email.com')).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining('-error')
    );
    expect(screen.getByPlaceholderText('you@email.com')).not.toHaveAttribute(
      'aria-invalid'
    );

    fireEvent.change(screen.getByPlaceholderText('you@email.com'), {
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

    fireEvent.click(
      screen.getByRole('button', { name: 'Retry Security Check' })
    );
    expect(turnstileMock.resetSignal).toBe(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('changelog-subscribe-form')).getByRole(
        'button',
        { name: 'Subscribe' }
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

  it('shows already subscribed without asking for an email that was not sent', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ state: 'subscribed' }),
    } as Response);
    render(<ChangelogEmailSignup source='marketing:/blog' />);
    fireEvent.change(screen.getByLabelText('Email Address'), {
      target: { value: 'reader@example.com' },
    });
    fireEvent.submit(screen.getByTestId('changelog-subscribe-form'));
    expect(
      await screen.findByRole('heading', { name: 'Jovie changelog' })
    ).toBeVisible();
    expect(
      screen.getByText('This email already receives the Jovie changelog.')
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Subscribe' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Check your email to confirm your subscription.')
    ).not.toBeInTheDocument();
    expect(
      JSON.parse(vi.mocked(global.fetch).mock.calls[0][1]?.body as string)
        .source
    ).toBe('marketing:/blog');
  });

  it('shows the submitted address and lets the visitor correct a typo', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ state: 'confirmation_required' }),
    } as Response);

    render(<ChangelogEmailSignup />);
    fireEvent.change(screen.getByLabelText('Email Address'), {
      target: { value: 'artist@exmaple.com' },
    });
    fireEvent.submit(screen.getByTestId('changelog-subscribe-form'));

    const panel = await screen.findByTestId('changelog-confirmation-sent');
    expect(within(panel).getByText('artist@exmaple.com')).toBeInTheDocument();
    const form = screen.getByTestId('changelog-subscribe-form');
    expect(form).toHaveAttribute('inert');
    expect(form).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(
      within(panel).getByRole('button', { name: 'Use A Different Email' })
    );

    expect(form).not.toHaveAttribute('inert');
    const input = screen.getByLabelText('Email Address');
    expect(input).toHaveValue('artist@exmaple.com');
    await waitFor(() => expect(input).toHaveFocus());

    fireEvent.change(input, { target: { value: 'artist@example.com' } });
    fireEvent.submit(screen.getByTestId('changelog-subscribe-form'));

    await waitFor(() =>
      expect(
        within(screen.getByTestId('changelog-confirmation-sent')).getByText(
          'artist@example.com'
        )
      ).toBeInTheDocument()
    );
    const bodies = vi
      .mocked(global.fetch)
      .mock.calls.map(
        call => JSON.parse(call[1]?.body as string) as { email: string }
      );
    expect(bodies.map(body => body.email)).toEqual([
      'artist@exmaple.com',
      'artist@example.com',
    ]);
  });

  it('resends the confirmation to the submitted address and reports the result', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ state: 'confirmation_required' }),
    } as Response);

    render(<ChangelogEmailSignup />);
    fireEvent.change(screen.getByLabelText('Email Address'), {
      target: { value: 'reader@example.com' },
    });
    fireEvent.submit(screen.getByTestId('changelog-subscribe-form'));

    const panel = await screen.findByTestId('changelog-confirmation-sent');
    const resend = within(panel).getByRole('button', {
      name: 'Resend Confirmation',
    });
    await waitFor(() => expect(resend).not.toBeDisabled());
    fireEvent.click(resend);

    expect(
      await within(panel).findByText(
        'Confirmation email sent again to reader@example.com.'
      )
    ).toBeInTheDocument();
    expect(global.fetch).toHaveBeenLastCalledWith('/api/changelog/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'reader@example.com',
        turnstileToken: 'test-turnstile-token',
        source: 'changelog_page',
      }),
    });
    // The security token is single-use: each submission consumes it and the
    // widget is reset so the next attempt needs a fresh server-checked token.
    expect(turnstileMock.resetSignal).toBe(2);
  });

  it('surfaces the server resend cooldown without losing the submitted address', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: 'confirmation_required' }),
    } as Response);

    render(<ChangelogEmailSignup />);
    fireEvent.change(screen.getByLabelText('Email Address'), {
      target: { value: 'reader@example.com' },
    });
    fireEvent.submit(screen.getByTestId('changelog-subscribe-form'));

    const panel = await screen.findByTestId('changelog-confirmation-sent');
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error:
          'Confirmation email was just sent. Please wait before resending.',
        retryAfterSeconds: 42,
      }),
    } as Response);

    const resend = within(panel).getByRole('button', {
      name: 'Resend Confirmation',
    });
    await waitFor(() => expect(resend).not.toBeDisabled());
    fireEvent.click(resend);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please wait before resending.'
    );
    expect(within(panel).getByText('reader@example.com')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Check your email' })
    ).toBeVisible();
  });

  it('preserves the email on failure and rejects an unrecognized success response', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    render(<ChangelogEmailSignup />);
    fireEvent.change(screen.getByLabelText('Email Address'), {
      target: { value: 'reader@example.com' },
    });
    fireEvent.submit(screen.getByTestId('changelog-subscribe-form'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Subscription could not be confirmed'
    );
    expect(screen.getByLabelText('Email Address')).toHaveValue(
      'reader@example.com'
    );
    expect(screen.getByRole('status')).not.toHaveTextContent(
      'Check your email'
    );
  });
});

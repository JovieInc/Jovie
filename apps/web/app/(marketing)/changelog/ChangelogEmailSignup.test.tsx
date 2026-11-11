import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

// Rendered-state and accessibility coverage, one axe pass per state. The full
// Turnstile, resend and focus contract lives in
// tests/unit/marketing/changelog-email-signup.test.tsx.
type TurnstileState = { readonly status: string; readonly message?: string };

const turnstile = vi.hoisted(() => ({
  onStateChange: null as ((state: TurnstileState) => void) | null,
}));

vi.mock('@/components/atoms/InvisibleTurnstile', () => ({
  InvisibleTurnstile: ({
    onToken,
    onStateChange,
    resetSignal = 0,
  }: {
    readonly onToken: (token: string) => void;
    readonly onStateChange?: (state: TurnstileState) => void;
    readonly resetSignal?: number;
  }) => {
    useEffect(() => {
      turnstile.onStateChange = onStateChange ?? null;
      onToken('test-turnstile-token');
      onStateChange?.({ status: 'verified' });
    }, [onStateChange, onToken]);
    // A reset signal re-executes the widget for a fresh token, as in the
    // shared suite's stand-in.
    useEffect(() => {
      if (resetSignal > 0) onToken('test-turnstile-token');
    }, [resetSignal, onToken]);
    return null;
  },
  isTurnstileClientBypassed: () => false,
  isTurnstileClientConfigured: () => true,
}));

import { ChangelogEmailSignup } from './ChangelogEmailSignup';

const fetchMock = vi.fn<typeof fetch>();
const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const emailField = () => screen.getByRole('textbox', { name: 'Email address' });
const visualState = (container: HTMLElement) =>
  container
    .querySelector('[data-pen-source="qKrDn"]')
    ?.getAttribute('data-visual-state');

async function subscribe(email = 'artist@example.com') {
  const user = userEvent.setup();
  await user.type(emailField(), email);
  await user.click(screen.getByRole('button', { name: 'Subscribe' }));
  return user;
}

describe('ChangelogEmailSignup states', () => {
  beforeEach(() => {
    turnstile.onStateChange = null;
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the empty form with its heading, field and consent line', async () => {
    const { container } = render(<ChangelogEmailSignup />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Get updates' })
    ).toBeInTheDocument();
    expect(emailField()).toHaveValue('');
    expect(screen.getByText('Unsubscribe anytime.')).toBeInTheDocument();
    expect(visualState(container)).toBe('idle');
    await expectNoA11yViolations(container);
  });

  it('keeps typed input and focuses the field instead of submitting it blank', async () => {
    const user = userEvent.setup();
    render(<ChangelogEmailSignup />);

    await user.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(emailField(), 'artist@example.com');
    expect(emailField()).toHaveValue('artist@example.com');
  });

  it('freezes the field and announces the request while it is in flight', async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined));
    const { container } = render(<ChangelogEmailSignup />);

    await subscribe();

    await waitFor(() => expect(visualState(container)).toBe('submitting'));
    expect(emailField()).toHaveAttribute('readonly');
    expect(emailField()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('changelog-success-message')).toHaveTextContent(
      'Subscribing…'
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/changelog/subscribe',
      expect.objectContaining({ method: 'POST' })
    );
    await expectNoA11yViolations(container);
  });

  it('shows the server error, marks the field invalid and clears it on edit', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(400, { error: 'Enter a valid email address.' })
    );
    const { container } = render(<ChangelogEmailSignup />);

    const user = await subscribe('artist@example');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a valid email address.'
    );
    expect(emailField()).toHaveAttribute('aria-invalid', 'true');
    expect(emailField()).toHaveValue('artist@example');
    await expectNoA11yViolations(container);

    await user.type(emailField(), '.com');
    expect(emailField()).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces a dropped connection as an error and keeps the address', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { container } = render(<ChangelogEmailSignup />);

    await subscribe();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to fetch'
    );
    expect(emailField()).toHaveValue('artist@example.com');
    await expectNoA11yViolations(container);
  });

  it('shows the pending confirmation and resends it on request', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(200, { state: 'confirmation_required' })
    );
    const { container } = render(<ChangelogEmailSignup />);

    const user = await subscribe();

    expect(
      await screen.findByRole('heading', { name: 'Check your email' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('changelog-confirmation-sent')).toHaveTextContent(
      'We sent a confirmation link to artist@example.com.'
    );
    expect(screen.getByTestId('changelog-subscribe-form')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole('button', { name: 'Resend Confirmation' })
    );
    expect(
      await screen.findByText(
        'Confirmation email sent again to artist@example.com.'
      )
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it('returns to the form with the address when the visitor changes email', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(200, { state: 'confirmation_required' })
    );
    const { container } = render(<ChangelogEmailSignup />);

    const user = await subscribe();
    await user.click(
      await screen.findByRole('button', { name: 'Use A Different Email' })
    );

    expect(visualState(container)).toBe('idle');
    expect(emailField()).toHaveValue('artist@example.com');
    await waitFor(() => expect(emailField()).toHaveFocus());
  });

  it('confirms an address that already receives the changelog', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(200, { state: 'subscribed' })
    );
    const { container } = render(<ChangelogEmailSignup />);

    await subscribe();

    expect(
      await screen.findByRole('heading', { name: 'Jovie changelog' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('This email already receives the Jovie changelog.')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('changelog-confirmation-sent')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('marks the form unavailable when the security check fails and retries it', async () => {
    const { container } = render(<ChangelogEmailSignup />);
    await waitFor(() => expect(turnstile.onStateChange).not.toBeNull());

    act(() =>
      turnstile.onStateChange?.({
        status: 'timeout',
        message: 'Security check timed out.',
      })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Security check timed out.'
    );
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDisabled();
    await expectNoA11yViolations(container);

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Retry Security Check' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled()
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders long and right-to-left copy without dropping any of it', async () => {
    const longEmail = `${'release-notes'.repeat(4)}@${'label'.repeat(8)}.example.com`;
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChangelogEmailSignup
          initialEmail={longEmail}
          copy={{
            idleHeading: 'احصل على آخر التحديثات من Jovie كل أسبوع',
            buttonLabel: 'اشترك',
            consent: 'يمكنك إلغاء الاشتراك في أي وقت.',
            successHeading: 'تحقق من بريدك',
            successDescription: 'أكد اشتراكك لتلقي رسائل Jovie.',
            subscribedHeading: 'سجل تغييرات Jovie',
            subscribedDescription: 'هذا البريد مشترك بالفعل.',
          }}
        />
      </div>
    );

    expect(
      screen.getByRole('heading', {
        name: 'احصل على آخر التحديثات من Jovie كل أسبوع',
      })
    ).toHaveClass('line-clamp-2');
    expect(emailField()).toHaveValue(longEmail);
    expect(screen.getByRole('button', { name: 'اشترك' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

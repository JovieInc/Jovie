import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailCodeAuthForm } from './EmailCodeAuthForm';

// Better Auth client calls resolve with `{ data, error }` instead of
// throwing. Regression coverage for the silent-failure bug where an error
// result advanced the flow (send → code step with no OTP in flight; verify →
// hard navigation while signed out).

const sendVerificationOtp = vi.fn();
const signInEmailOtp = vi.fn();

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    emailOtp: {
      sendVerificationOtp: (...args: unknown[]) => sendVerificationOtp(...args),
    },
    signIn: {
      emailOtp: (...args: unknown[]) => signInEmailOtp(...args),
    },
  },
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ isLoaded: true, isSignedIn: false }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const trackFunnelStep = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics/signup-funnel-client', () => ({ trackFunnelStep }));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const locationAssign = vi.fn();

function renderForm() {
  return render(<EmailCodeAuthForm mode='sign-up' redirectUrl='/start' />);
}

async function submitEmail() {
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'artist@example.com' },
  });
  fireEvent.submit(
    screen.getByLabelText(/email/i).closest('form') as HTMLFormElement
  );
}

async function reachCodeStep() {
  sendVerificationOtp.mockResolvedValueOnce({
    data: { success: true },
    error: null,
  });
  await submitEmail();
  await waitFor(() =>
    expect(
      document.querySelector('[data-auth-email-code-step="code"]')
    ).toBeTruthy()
  );
}

async function submitCode(code: string) {
  // The autofill overlay input accepts the full code in one change event and
  // fires `onComplete` once all six digits are present.
  fireEvent.change(screen.getByTestId('otp-autofill-input'), {
    target: { value: code },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('location', { assign: locationAssign } as unknown as Location);
});

describe('EmailCodeAuthForm', () => {
  it.each([
    '<script>@example.com',
    'artist,name@example.com',
    'artíst@example.com',
    'artist@-example.com',
    'artist@example-.com',
    'artist..name@example.com',
  ])('rejects %s accessibly before requesting an OTP', async email => {
    renderForm();
    const input = screen.getByRole('textbox', { name: 'Email' });
    fireEvent.change(input, { target: { value: email } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(sendVerificationOtp).not.toHaveBeenCalled();
    expect(trackFunnelStep).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /that email address doesn’t look right/i
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(
      'That email address doesn’t look right. Check it and try again.'
    );
    expect(input).toBeEnabled();
    expect(input).toHaveValue(email);
  });

  it('keeps an email typed before hydration and sends the code for it', async () => {
    // Production regression (2026-10-18/20): an email typed or autofilled
    // into the server-rendered field before React hydrated was wiped by the
    // first post-hydration render, and the next click showed "Enter your
    // email address." with no OTP request.
    sendVerificationOtp.mockResolvedValueOnce({
      data: { success: true },
      error: null,
    });
    const element = (
      <EmailCodeAuthForm mode='sign-in' redirectUrl='/app/dashboard' />
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(element);
    document.body.append(container);
    const ssrInput = container.querySelector<HTMLInputElement>('#auth-email');
    if (!ssrInput) throw new Error('server-rendered email input missing');
    ssrInput.value = 'artist@example.com';

    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, element);
      });

      const view = within(container);
      expect(view.getByLabelText('Email')).toHaveValue('artist@example.com');

      await act(async () => {
        fireEvent.click(
          view.getByRole('button', { name: /send sign-in code/i })
        );
      });

      expect(sendVerificationOtp).toHaveBeenCalledWith({
        email: 'artist@example.com',
        type: 'sign-in',
      });
      expect(
        view.queryByText('Enter your email address.')
      ).not.toBeInTheDocument();
      expect(await view.findByText(/enter the code sent to/i)).toBeVisible();
    } finally {
      act(() => root?.unmount());
      container.remove();
    }
  });

  it('allows correcting a malformed mailbox to a plus address', async () => {
    sendVerificationOtp.mockResolvedValueOnce({
      data: { success: true },
      error: null,
    });
    renderForm();
    const input = screen.getByRole('textbox', { name: 'Email' });
    const form = input.closest('form') as HTMLFormElement;
    fireEvent.change(input, { target: { value: '<script>@example.com' } });
    fireEvent.submit(form);
    expect(sendVerificationOtp).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'e2e+jov8342@example.com' } });
    fireEvent.submit(form);
    await waitFor(() => expect(sendVerificationOtp).toHaveBeenCalledTimes(1));
    expect(sendVerificationOtp).toHaveBeenCalledWith({
      email: 'e2e+jov8342@example.com',
      type: 'sign-in',
    });
    await waitFor(() =>
      expect(
        document.querySelector('[data-auth-email-code-step="code"]')
      ).toBeTruthy()
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('records a signup auth_start, then an error step when the send fails', async () => {
    sendVerificationOtp.mockResolvedValueOnce({
      data: null,
      error: { status: 500, statusText: 'Server Error' },
    });
    renderForm();
    await submitEmail();

    await waitFor(() => expect(trackFunnelStep).toHaveBeenCalledTimes(2));
    expect(trackFunnelStep).toHaveBeenNthCalledWith(1, {
      funnel: 'artist_signup',
      step: 'auth_start',
      surface: 'signup',
    });
    expect(trackFunnelStep).toHaveBeenNthCalledWith(2, {
      funnel: 'artist_signup',
      step: 'auth_start',
      outcome: 'error',
      surface: 'signup',
      reason: 'otp_send_failed',
    });
  });

  it('does not count sign-in as a signup funnel step', async () => {
    sendVerificationOtp.mockResolvedValueOnce({
      data: { success: true },
      error: null,
    });
    render(<EmailCodeAuthForm mode='sign-in' redirectUrl='/start' />);
    await submitEmail();

    await waitFor(() => expect(sendVerificationOtp).toHaveBeenCalledTimes(1));
    expect(trackFunnelStep).not.toHaveBeenCalled();
  });

  it('stays on the email step and shows an error when send returns an error result', async () => {
    sendVerificationOtp.mockResolvedValueOnce({
      data: null,
      error: { status: 429, statusText: 'Too Many Requests' },
    });
    renderForm();
    await submitEmail();

    await waitFor(() =>
      expect(
        screen.getByText(/too many requests\. please wait a moment/i)
      ).toBeTruthy()
    );
    expect(
      document.querySelector('[data-auth-email-code-step="code"]')
    ).toBeNull();
  });

  it('shows the invalid-code error and does not navigate when verify returns an error result', async () => {
    renderForm();
    await reachCodeStep();

    signInEmailOtp.mockResolvedValueOnce({
      data: null,
      error: { code: 'INVALID_OTP', message: 'Invalid OTP', status: 400 },
    });
    await submitCode('111111');

    await waitFor(() =>
      expect(screen.getByText(/that code is incorrect/i)).toBeTruthy()
    );
    expect(locationAssign).not.toHaveBeenCalled();
  });

  it('locks the flow when verify reports too many attempts', async () => {
    renderForm();
    await reachCodeStep();

    signInEmailOtp.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Too many attempts',
        status: 403,
      },
    });
    await submitCode('111111');

    await waitFor(() =>
      expect(
        document.querySelector('[data-auth-email-code-step="locked"]')
      ).toBeTruthy()
    );
    expect(locationAssign).not.toHaveBeenCalled();
  });

  it('reads a send error code from the message prefix when code is absent', async () => {
    sendVerificationOtp.mockResolvedValueOnce({
      data: null,
      error: { message: 'rate_limit_exceeded: slow down' },
    });
    renderForm();
    await submitEmail();

    await waitFor(() =>
      expect(
        screen.getByText(/too many requests\. please wait a moment/i)
      ).toBeTruthy()
    );
    expect(
      document.querySelector('[data-auth-email-code-step="code"]')
    ).toBeNull();
  });

  it('locks verify when the message prefix is too many attempts and code is absent', async () => {
    renderForm();
    await reachCodeStep();

    signInEmailOtp.mockResolvedValueOnce({
      data: null,
      error: { message: 'TOO_MANY_ATTEMPTS: locked out' },
    });
    await submitCode('111111');

    await waitFor(() =>
      expect(
        document.querySelector('[data-auth-email-code-step="locked"]')
      ).toBeTruthy()
    );
    expect(locationAssign).not.toHaveBeenCalled();
  });

  it('preserves Change email through cooldown and resend without submitting a code', async () => {
    vi.useFakeTimers();
    try {
      sendVerificationOtp
        .mockResolvedValueOnce({ data: { success: true }, error: null })
        .mockResolvedValueOnce({ data: { success: true }, error: null });
      renderForm();
      await act(async () => {
        await submitEmail();
      });
      const change = screen.getByRole('button', { name: 'Change email' });
      expect(change).toBeEnabled();
      change.focus();
      expect(change).toHaveFocus();
      expect(screen.getByText('Resend in 30s')).toHaveAttribute(
        'aria-live',
        'polite'
      );
      expect(
        screen.queryByRole('button', { name: 'Resend Verification Code' })
      ).not.toBeInTheDocument();
      expect(sendVerificationOtp).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(31_000);
      });
      expect(screen.getByRole('button', { name: 'Change email' })).toBe(change);
      expect(change).toHaveFocus();
      const resend = screen.getByRole('button', {
        name: 'Resend Verification Code',
      });
      await act(async () => {
        fireEvent.click(resend);
      });
      expect(sendVerificationOtp).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('button', { name: 'Change email' })).toBe(change);
      expect(change).toHaveFocus();
      expect(change).toBeEnabled();
      fireEvent.click(change);
      expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue(
        'artist@example.com'
      );
      expect(
        screen.queryByTestId('otp-autofill-input')
      ).not.toBeInTheDocument();
      expect(signInEmailOtp).not.toHaveBeenCalled();
      expect(locationAssign).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('navigates to the redirect URL when verify succeeds', async () => {
    renderForm();
    await reachCodeStep();

    signInEmailOtp.mockResolvedValueOnce({ data: { user: {} }, error: null });
    await submitCode('424242');

    await waitFor(() => expect(locationAssign).toHaveBeenCalledWith('/start'));
  });
});

describe('EmailCodeAuthForm pre-hydration guard', () => {
  it('server-renders the send button disabled so an early click cannot native-submit the email into the URL', () => {
    const html = renderToString(
      <EmailCodeAuthForm mode='sign-up' redirectUrl='/start' />
    );
    const container = document.createElement('div');
    container.innerHTML = html;
    const sendButton = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    );

    expect(sendButton?.disabled).toBe(true);
  });

  it('enables the send button once the client submit handler is attached', async () => {
    renderForm();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Send sign-in code' })
      ).toBeEnabled()
    );
  });
});

describe('EmailCodeAuthForm page alignment', () => {
  async function reachCodeStepWithAlign(align: 'left' | 'center') {
    sendVerificationOtp.mockResolvedValueOnce({
      data: { success: true },
      error: null,
    });
    render(
      <EmailCodeAuthForm mode='sign-in' redirectUrl='/app' align={align} />
    );
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'artist@example.com' },
    });
    fireEvent.submit(
      screen.getByLabelText(/email/i).closest('form') as HTMLFormElement
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-auth-email-code-step="code"]')
      ).toBeTruthy()
    );
    return document.querySelector('[data-auth-email-code-step="code"]');
  }

  it('left-aligns the code step on full-page shells', async () => {
    const step = await reachCodeStepWithAlign('left');
    const intro = step?.querySelector('p');
    expect(intro?.className).toContain('text-left');
    expect(intro?.className).not.toContain('text-center');
  });

  it('keeps overlay captures centered by default', async () => {
    const step = await reachCodeStepWithAlign('center');
    const intro = step?.querySelector('p');
    expect(intro?.className).toContain('text-center');
    expect(intro?.className).not.toContain('text-left');
  });
});

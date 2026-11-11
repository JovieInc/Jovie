import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EmailCodeAuthForm } from './EmailCodeAuthForm';

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
vi.mock('@/lib/analytics/signup-funnel-client', () => ({
  trackFunnelStep: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/auth/email-code-errors', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/auth/email-code-errors')>()),
  reportUnmappedVerifyError: vi.fn(),
}));

const EMAIL = 'artist@example.com';

function renderForm(email = EMAIL) {
  return render(
    <EmailCodeAuthForm
      mode='sign-in'
      redirectUrl='/app'
      initialEmailAddress={email}
    />
  );
}

async function reachCodeStep(email = EMAIL) {
  sendVerificationOtp.mockResolvedValueOnce({ data: {}, error: null });
  const view = renderForm(email);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }));
  });
  expect(
    view.container.querySelector('[data-auth-email-code-step="code"]')
  ).toBeTruthy();
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('location', { assign: vi.fn() } as unknown as Location);
});

describe('EmailCodeAuthForm certificate', () => {
  it('has no axe violations on the email step', async () => {
    const { container } = renderForm();

    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue(EMAIL);
    await expectNoA11yViolations(container);
  });

  it('announces an empty email without requesting a code', async () => {
    const { container } = renderForm('');

    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter your email address.'
    );
    expect(sendVerificationOtp).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('marks the send in flight and has no axe violations while pending', async () => {
    sendVerificationOtp.mockImplementation(() => new Promise(() => undefined));
    const { container } = renderForm();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Send sign-in code' })
      );
    });

    const pending = screen.getByRole('button', { name: 'Sending code…' });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('keeps the typed email when the send fails offline', async () => {
    sendVerificationOtp.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { container } = renderForm();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Send sign-in code' })
      );
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not send the code. Please try again.'
    );
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue(EMAIL);
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('keeps typed input and focus through a parent rerender, Escape and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <EmailCodeAuthForm mode='sign-up' redirectUrl='/start' />
    );
    const input = screen.getByRole('textbox', { name: 'Email' });

    await user.type(input, 'artist@jov.ie');
    rerender(
      <EmailCodeAuthForm mode='sign-up' redirectUrl='/start' align='left' />
    );

    expect(screen.getByRole('textbox', { name: 'Email' })).toBe(input);
    expect(input).toHaveValue('artist@jov.ie');
    expect(input).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(input).toHaveValue('artist@jov.ie');
    expect(input).toHaveFocus();

    await user.tab();
    expect(input).not.toHaveFocus();
    expect(input).toHaveValue('artist@jov.ie');
  });

  it('renders the code step recovery actions on the canonical Button', async () => {
    vi.useFakeTimers();
    try {
      await reachCodeStep();
      const change = screen.getByRole('button', { name: 'Change email' });
      expect(change).toHaveAttribute('data-variant', 'tertiary');
      expect(change.parentElement).toHaveClass(
        'min-h-11',
        'items-center',
        'justify-items-center'
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(31_000);
      });
      const resend = screen.getByRole('button', {
        name: 'Resend Verification Code',
      });
      expect(resend).toHaveAttribute('data-variant', 'tertiary');
      expect(resend).toHaveAttribute('type', 'button');
      expect(resend).toHaveTextContent('Resend Code');
    } finally {
      vi.useRealTimers();
    }
  });

  it('has no axe violations on the code step with a partial code', async () => {
    const { container } = await reachCodeStep();

    fireEvent.change(screen.getByTestId('otp-autofill-input'), {
      target: { value: '123' },
    });

    expect(screen.getByRole('button', { name: 'Verify Code' })).toBeDisabled();
    expect(signInEmailOtp).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('has no axe violations when a wrong code is rejected', async () => {
    signInEmailOtp.mockResolvedValueOnce({
      data: null,
      error: { code: 'INVALID_OTP', status: 400 },
    });
    const { container } = await reachCodeStep();

    await act(async () => {
      fireEvent.change(screen.getByTestId('otp-autofill-input'), {
        target: { value: '111111' },
      });
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code is incorrect. Check your email and try again.'
    );
    await expectNoA11yViolations(container);
  });

  it('locks after too many attempts and offers a new code', async () => {
    signInEmailOtp.mockResolvedValueOnce({
      data: null,
      error: { code: 'TOO_MANY_ATTEMPTS', status: 403 },
    });
    const { container } = await reachCodeStep();

    await act(async () => {
      fireEvent.change(screen.getByTestId('otp-autofill-input'), {
        target: { value: '111111' },
      });
    });

    await waitFor(() =>
      expect(
        container.querySelector('[data-auth-email-code-step="locked"]')
      ).toBeTruthy()
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Too many incorrect attempts.'
    );
    await expectNoA11yViolations(container);

    fireEvent.click(screen.getByRole('button', { name: 'Request A New Code' }));
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue(EMAIL);
  });

  it('has no axe violations for a long address in a right-to-left page', async () => {
    sendVerificationOtp.mockResolvedValueOnce({ data: {}, error: null });
    const long = 'booking.and.management.team@example-records-group.com';
    const { container } = render(
      <div dir='rtl'>
        <EmailCodeAuthForm
          mode='sign-in'
          redirectUrl='/app'
          initialEmailAddress={long}
          align='left'
        />
      </div>
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Send sign-in code' })
      );
    });

    const address = await waitFor(() => {
      const node = container.querySelector('[data-auth-email-address]');
      expect(node).toBeTruthy();
      return node as HTMLElement;
    });
    expect(address).toHaveTextContent(long);
    expect(address).toHaveAttribute('title', long);
    expect(address).toHaveClass('truncate');
    await expectNoA11yViolations(container);
  });
});

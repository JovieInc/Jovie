import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';

const { mockSendEmail, mockCaptureError, mockIsDeterministic } = vi.hoisted(
  () => ({
    mockSendEmail: vi.fn(),
    mockCaptureError: vi.fn(),
    mockIsDeterministic: vi.fn(),
  })
);

vi.mock('@/lib/email/send', () => ({ sendEmail: mockSendEmail }));
vi.mock('@/lib/email/templates/auth-otp', () => ({
  getAuthOtpFromEmail: () => 'Jovie <auth@example.test>',
  getAuthOtpSubject: () => 'Your Jovie code',
  getAuthOtpText: ({ otpCode }: { otpCode: string }) => `code ${otpCode}`,
  getAuthOtpHtml: ({ otpCode }: { otpCode: string }) => `<b>${otpCode}</b>`,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mockCaptureError }));
vi.mock('./rate-limit-rules', () => ({
  isDeterministicTestOtpEmail: mockIsDeterministic,
}));

import { sendEmailOtp } from './email-otp-sender';

const input = { email: 'artist@jovie.test', type: 'sign-in', otp: '123456' };

type InfoSpy = MockInstance<typeof console.info>;

function loggedOutcomes(spy: InfoSpy): unknown[] {
  return spy.mock.calls
    .map(([line]: unknown[]) => String(line))
    .filter((line: string) => line.startsWith('[auth] email OTP send '))
    .map((line: string) =>
      JSON.parse(line.slice('[auth] email OTP send '.length))
    );
}

describe('sendEmailOtp', () => {
  let infoSpy: InfoSpy;

  beforeEach(() => {
    vi.resetAllMocks();
    mockIsDeterministic.mockReturnValue(false);
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it('sends the code and logs a redacted sent outcome', async () => {
    mockSendEmail.mockResolvedValueOnce({ success: true, messageId: 'msg_1' });

    await expect(sendEmailOtp(input)).resolves.toBeUndefined();

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'artist@jovie.test', text: 'code 123456' })
    );
    expect(loggedOutcomes(infoSpy)).toEqual([
      {
        outcome: 'sent',
        type: 'sign-in',
        email: '[redacted]@jovie.test',
        messageId: 'msg_1',
      },
    ]);
  });

  it('rejects when the provider reports a non-sent result instead of resolving silently', async () => {
    // sendEmail returns { success: false } for Resend errors and skips; the
    // hook used to ignore it, so the API answered 200 with no email sent.
    mockSendEmail.mockResolvedValueOnce({
      success: false,
      error: 'Recipient domain example.com is reserved for testing',
    });

    await expect(sendEmailOtp(input)).rejects.toThrow(/reserved for testing/);

    expect(loggedOutcomes(infoSpy)).toEqual([
      expect.objectContaining({ outcome: 'failed', type: 'sign-in' }),
    ]);
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Email OTP send failed',
      expect.any(Error),
      expect.objectContaining({ email: '[redacted]@jovie.test' })
    );
  });

  it('rejects and logs when the provider throws', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('resend timeout'));

    await expect(sendEmailOtp(input)).rejects.toThrow('resend timeout');
    expect(loggedOutcomes(infoSpy)).toEqual([
      expect.objectContaining({ outcome: 'failed', error: 'resend timeout' }),
    ]);
  });

  it('skips the provider for deterministic test emails and still logs the outcome', async () => {
    mockIsDeterministic.mockReturnValue(true);

    await sendEmailOtp(input);

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(loggedOutcomes(infoSpy)).toEqual([
      expect.objectContaining({ outcome: 'skipped_test_email' }),
    ]);
  });

  it('never logs the OTP or the mailbox local part', async () => {
    mockSendEmail.mockResolvedValueOnce({ success: true, messageId: 'm' });

    await sendEmailOtp(input);

    const lines = infoSpy.mock.calls
      .map(([line]: unknown[]) => String(line))
      .join('\n');
    expect(lines).not.toContain('123456');
    expect(lines).not.toContain('artist@');
  });
});

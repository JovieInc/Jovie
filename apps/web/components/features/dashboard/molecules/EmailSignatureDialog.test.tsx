import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/components/feedback';
import { copyToClipboard } from '@/hooks/useClipboard';
import {
  buildEmailSignature,
  type EmailSignatureInput,
} from '@/lib/email-signature/build-signature';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EmailSignatureDialog } from './EmailSignatureDialog';

vi.mock('@/hooks/useClipboard', () => ({ copyToClipboard: vi.fn() }));
vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const input: EmailSignatureInput = {
  name: 'Sasha Waves',
  handle: 'sashawaves',
  tagline: 'Independent artist',
};

const longInput: EmailSignatureInput = {
  ...input,
  name: 'Sasha Waves and the Midnight Orchestra — International Tour Edition',
  tagline:
    'Independent artists sharing new releases, live sessions, and stories from the road around the world.',
};

const rtlInput: EmailSignatureInput = {
  ...input,
  name: 'ساشا ويفز وأوركسترا منتصف الليل',
  tagline: 'موسيقى مستقلة وحفلات مباشرة وقصص من الجولة حول العالم',
};

// jsdom cannot load srcDoc. Audit the outer dialog and iframe title here;
// assert the sandbox/document payload separately and inspect it in browser QA.
const auditDialog = () =>
  expectNoA11yViolations(screen.getByRole('dialog'), { iframes: false });

describe('EmailSignatureDialog', () => {
  const originalDir = document.documentElement.getAttribute('dir');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(copyToClipboard).mockResolvedValue(true);
  });

  afterEach(() => {
    if (originalDir === null) document.documentElement.removeAttribute('dir');
    else document.documentElement.setAttribute('dir', originalDir);
  });

  it.each([
    ['html', 'Copy HTML', 'Email Signature copied'],
    ['text', 'Copy As Plain Text', 'Plain text signature copied'],
  ] as const)(
    'copies the generated %s signature',
    async (kind, label, message) => {
      const user = userEvent.setup();
      render(<EmailSignatureDialog open onClose={vi.fn()} input={input} />);
      const button = screen.getByRole('button', { name: label });

      await user.click(button);

      expect(copyToClipboard).toHaveBeenCalledExactlyOnceWith(
        buildEmailSignature(input)[kind]
      );
      expect(toast.success).toHaveBeenCalledExactlyOnceWith(message);
      expect(toast.error).not.toHaveBeenCalled();
      // The check icon is the dialog's visible copied feedback.
      expect(button.querySelector('.lucide-check')).toBeInTheDocument();
      await auditDialog();
    }
  );

  it.each([
    ['html', 'Copy HTML'],
    ['text', 'Copy As Plain Text'],
  ] as const)(
    'reports a failed %s copy without showing copied feedback',
    async (kind, label) => {
      vi.mocked(copyToClipboard).mockResolvedValue(false);
      const user = userEvent.setup();
      render(<EmailSignatureDialog open onClose={vi.fn()} input={input} />);
      const button = screen.getByRole('button', { name: label });

      await user.click(button);

      expect(copyToClipboard).toHaveBeenCalledExactlyOnceWith(
        buildEmailSignature(input)[kind]
      );
      expect(toast.error).toHaveBeenCalledExactlyOnceWith(
        'Failed to copy signature'
      );
      expect(toast.success).not.toHaveBeenCalled();
      expect(button.querySelector('.lucide-copy')).toBeInTheDocument();
      expect(button.querySelector('.lucide-check')).not.toBeInTheDocument();
      await auditDialog();
    }
  );

  it('disables copying until profile data arrives, then previews that profile', async () => {
    const user = userEvent.setup();
    const props = { open: true, onClose: vi.fn() };
    const { rerender } = render(
      <EmailSignatureDialog {...props} input={null} />
    );
    expect(screen.getByText(/Profile data is unavailable/)).toBeVisible();
    expect(
      screen.queryByTitle('Email Signature preview')
    ).not.toBeInTheDocument();
    for (const name of ['Copy HTML', 'Copy As Plain Text']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      await user.click(button);
    }
    expect(copyToClipboard).not.toHaveBeenCalled();
    await auditDialog();

    rerender(<EmailSignatureDialog {...props} input={input} />);
    const preview = screen.getByTitle('Email Signature preview');
    expect(preview).toHaveAttribute('sandbox', '');
    expect(preview).toHaveAttribute(
      'srcDoc',
      expect.stringContaining(`<body>${buildEmailSignature(input).html}</body>`)
    );
    expect(screen.getByRole('button', { name: 'Copy HTML' })).toBeEnabled();
    await user.click(
      screen.getByRole('button', { name: 'Copy As Plain Text' })
    );
    expect(copyToClipboard).toHaveBeenCalledExactlyOnceWith(
      buildEmailSignature(input).text
    );
  });

  it('clears copied feedback after closing and reopening', async () => {
    const user = userEvent.setup();
    const props = { input, onClose: vi.fn() };
    const { rerender } = render(<EmailSignatureDialog {...props} open />);
    await user.click(screen.getByRole('button', { name: 'Copy HTML' }));
    expect(
      screen
        .getByRole('button', { name: 'Copy HTML' })
        .querySelector('.lucide-check')
    ).toBeInTheDocument();

    rerender(<EmailSignatureDialog {...props} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(<EmailSignatureDialog {...props} open />);
    const button = screen.getByRole('button', { name: 'Copy HTML' });
    expect(button.querySelector('.lucide-copy')).toBeInTheDocument();
    expect(button.querySelector('.lucide-check')).not.toBeInTheDocument();
    await user.click(button);
    expect(copyToClipboard).toHaveBeenCalledTimes(2);
  });

  it('requests closing when Escape is pressed from a dialog control', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<EmailSignatureDialog open onClose={onClose} input={input} />);
    await user.click(screen.getByRole('button', { name: 'Copy HTML' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each([
    { state: 'default', profile: input, dir: 'ltr' },
    { state: 'long content', profile: longInput, dir: 'ltr' },
    { state: 'RTL', profile: rtlInput, dir: 'rtl' },
  ])('has an accessible $state dialog', async ({ profile, dir }) => {
    document.documentElement.setAttribute('dir', dir);
    render(<EmailSignatureDialog open onClose={vi.fn()} input={profile} />);
    expect(
      screen.getByRole('dialog', { name: 'Email Signature' })
    ).toBeVisible();
    expect(screen.getByTitle('Email Signature preview')).toHaveAttribute(
      'srcDoc',
      expect.stringContaining(buildEmailSignature(profile).html)
    );
    await auditDialog();
  });
});

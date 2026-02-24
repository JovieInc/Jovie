import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerificationError } from '@/components/dashboard/organisms/socials-form/types';

// Mock useClipboard
const mockCopy = vi.fn().mockResolvedValue(true);
let mockIsSuccess = false;
vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({
    copy: (...args: unknown[]) => {
      mockIsSuccess = true;
      return mockCopy(...args);
    },
    isSuccess: mockIsSuccess,
    status: mockIsSuccess ? 'success' : 'idle',
    isCopying: false,
    isError: false,
    reset: vi.fn(),
  }),
}));

// Mock next-themes (required by Dialog internals)
vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: 'light',
    theme: 'light',
    setTheme: vi.fn(),
  }),
}));

import { VerificationModal } from '@/components/dashboard/organisms/socials-form/VerificationModal';

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  hostname: 'example.com',
  verificationToken: 'jovie-verify=abc123def456',
  onVerify: vi.fn().mockResolvedValue(undefined),
  verifying: false,
  verificationStatus: 'pending' as const,
  verificationError: null as VerificationError | null,
};

describe('VerificationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSuccess = false;
  });

  describe('Rendering', () => {
    it('renders the modal with title and hostname', () => {
      render(<VerificationModal {...defaultProps} />);

      expect(screen.getByText('Verify Your Website')).toBeInTheDocument();
      expect(screen.getAllByText('example.com').length).toBeGreaterThanOrEqual(
        1
      );
    });

    it('displays the verification token', () => {
      render(<VerificationModal {...defaultProps} />);

      const tokenEl = screen.getByTestId('verification-token');
      expect(tokenEl).toHaveTextContent('jovie-verify=abc123def456');
    });

    it('renders step-by-step instructions', () => {
      render(<VerificationModal {...defaultProps} />);

      expect(
        screen.getByText(/Log in to your domain provider/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Navigate to the DNS settings/)
      ).toBeInTheDocument();
      expect(screen.getByText(/Wait for DNS propagation/)).toBeInTheDocument();
    });

    it('shows the Check Verification button', () => {
      render(<VerificationModal {...defaultProps} />);

      const button = screen.getByTestId('check-verification-button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('Check Verification');
      expect(button).not.toBeDisabled();
    });

    it('shows Pending status badge', () => {
      render(<VerificationModal {...defaultProps} />);

      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('shows propagation note', () => {
      render(<VerificationModal {...defaultProps} />);

      expect(
        screen.getByText(/DNS changes can take up to 48 hours/)
      ).toBeInTheDocument();
    });
  });

  describe('Copy token', () => {
    it('calls copy when copy button is clicked', async () => {
      const user = userEvent.setup();
      render(<VerificationModal {...defaultProps} />);

      const copyButton = screen.getByTestId('copy-token-button');
      await user.click(copyButton);

      expect(mockCopy).toHaveBeenCalledWith('jovie-verify=abc123def456');
    });
  });

  describe('DNS Provider Tips', () => {
    it('toggles provider links on click', async () => {
      const user = userEvent.setup();
      render(<VerificationModal {...defaultProps} />);

      expect(screen.queryByTestId('provider-links')).not.toBeInTheDocument();

      const toggle = screen.getByTestId('provider-tips-toggle');
      await user.click(toggle);

      expect(screen.getByTestId('provider-links')).toBeInTheDocument();
      expect(screen.getByText('Cloudflare')).toBeInTheDocument();
      expect(screen.getByText('GoDaddy')).toBeInTheDocument();
      expect(screen.getByText('Namecheap')).toBeInTheDocument();
      expect(screen.getByText('Google Domains')).toBeInTheDocument();
    });

    it('collapses provider links on second click', async () => {
      const user = userEvent.setup();
      render(<VerificationModal {...defaultProps} />);

      const toggle = screen.getByTestId('provider-tips-toggle');
      await user.click(toggle);
      expect(screen.getByTestId('provider-links')).toBeInTheDocument();

      await user.click(toggle);
      expect(screen.queryByTestId('provider-links')).not.toBeInTheDocument();
    });
  });

  describe('Verify button', () => {
    it('calls onVerify when clicked', async () => {
      const onVerify = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<VerificationModal {...defaultProps} onVerify={onVerify} />);

      await user.click(screen.getByTestId('check-verification-button'));

      expect(onVerify).toHaveBeenCalledTimes(1);
    });

    it('shows loading state while verifying', () => {
      render(<VerificationModal {...defaultProps} verifying={true} />);

      const button = screen.getByTestId('check-verification-button');
      expect(button).toHaveTextContent('Checking...');
      expect(button).toBeDisabled();
    });
  });

  describe('Success state', () => {
    it('shows success message when verified', () => {
      render(
        <VerificationModal {...defaultProps} verificationStatus='verified' />
      );

      expect(screen.getByTestId('verification-success')).toBeInTheDocument();
      expect(screen.getByText('Domain verified!')).toBeInTheDocument();
      // Instructions should not be visible
      expect(
        screen.queryByTestId('check-verification-button')
      ).not.toBeInTheDocument();
    });
  });

  describe('Error states', () => {
    it('shows dns_not_found error', () => {
      render(
        <VerificationModal
          {...defaultProps}
          verificationError={{
            code: 'dns_not_found',
            message: 'DNS TXT record not found yet.',
          }}
        />
      );

      const errorEl = screen.getByTestId('verification-error');
      expect(errorEl).toBeInTheDocument();
      expect(errorEl).toHaveTextContent(/couldn't find the TXT record yet/);
    });

    it('shows domain_already_claimed error', () => {
      render(
        <VerificationModal
          {...defaultProps}
          verificationError={{
            code: 'domain_already_claimed',
            message: 'This domain has already been verified.',
          }}
        />
      );

      const errorEl = screen.getByTestId('verification-error');
      expect(errorEl).toBeInTheDocument();
      expect(errorEl).toHaveTextContent(
        /already been verified by another account/
      );
    });

    it('shows invalid_url error', () => {
      render(
        <VerificationModal
          {...defaultProps}
          verificationError={{
            code: 'invalid_url',
            message: 'Invalid URL.',
          }}
        />
      );

      const errorEl = screen.getByTestId('verification-error');
      expect(errorEl).toHaveTextContent(/website URL is invalid/);
    });

    it('shows rate_limited error', () => {
      render(
        <VerificationModal
          {...defaultProps}
          verificationError={{
            code: 'rate_limited',
            message: 'Rate limited.',
          }}
        />
      );

      const errorEl = screen.getByTestId('verification-error');
      expect(errorEl).toHaveTextContent(/Too many verification attempts/);
    });

    it('shows server_error message', () => {
      render(
        <VerificationModal
          {...defaultProps}
          verificationError={{
            code: 'server_error',
            message: 'Something went wrong.',
          }}
        />
      );

      const errorEl = screen.getByTestId('verification-error');
      expect(errorEl).toHaveTextContent(/Something went wrong/);
    });

    it('does not show error when verificationError is null', () => {
      render(<VerificationModal {...defaultProps} verificationError={null} />);

      expect(
        screen.queryByTestId('verification-error')
      ).not.toBeInTheDocument();
    });

    it('error has alert role for accessibility', () => {
      render(
        <VerificationModal
          {...defaultProps}
          verificationError={{
            code: 'server_error',
            message: 'Oops',
          }}
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Dialog controls', () => {
    it('calls onClose when dialog close button is clicked', () => {
      const onClose = vi.fn();
      render(<VerificationModal {...defaultProps} onClose={onClose} />);

      const closeButton = screen.getByTestId('dialog-close-button');
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('does not render when open is false', () => {
      render(<VerificationModal {...defaultProps} open={false} />);

      expect(screen.queryByText('Verify Your Website')).not.toBeInTheDocument();
    });
  });

  describe('Unverified status', () => {
    it('shows Unverified badge when status is unverified', () => {
      render(
        <VerificationModal {...defaultProps} verificationStatus='unverified' />
      );

      expect(screen.getByText('Unverified')).toBeInTheDocument();
    });
  });
});

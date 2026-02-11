import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimBanner } from '@/components/profile/ClaimBanner';

// Mock useUserSafe hook (used by ClaimBanner)
const mockUseUser = vi.fn();
vi.mock('@/hooks/useClerkSafe', () => ({
  useUserSafe: () => mockUseUser(),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    'data-testid': testId,
    'aria-label': ariaLabel,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    'data-testid'?: string;
    'aria-label'?: string;
  }) => (
    <a
      href={href}
      className={className}
      data-testid={testId}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  ),
}));

describe('ClaimBanner', () => {
  const defaultProps = {
    claimToken: 'test-claim-token-123',
    profileHandle: 'testartist',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the claim banner with correct structure', () => {
      mockUseUser.mockReturnValue({ isSignedIn: false, isLoaded: true });

      render(<ClaimBanner {...defaultProps} />);

      expect(screen.getByTestId('claim-banner')).toBeInTheDocument();
      expect(screen.getByTestId('claim-banner-cta')).toBeInTheDocument();
      expect(screen.getByText('Claim Profile')).toBeInTheDocument();
    });

    it('displays profile handle when no display name provided', () => {
      mockUseUser.mockReturnValue({ isSignedIn: false, isLoaded: true });

      render(<ClaimBanner {...defaultProps} />);

      expect(
        screen.getByText('Your profile? Claim testartist')
      ).toBeInTheDocument();
    });

    it('displays display name when provided', () => {
      mockUseUser.mockReturnValue({ isSignedIn: false, isLoaded: true });

      render(
        <ClaimBanner {...defaultProps} displayName='Test Artist Display' />
      );

      expect(
        screen.getByText('Your profile? Claim Test Artist Display')
      ).toBeInTheDocument();
    });

    it('has proper accessibility attributes', () => {
      mockUseUser.mockReturnValue({ isSignedIn: false, isLoaded: true });

      render(<ClaimBanner {...defaultProps} displayName='Test Artist' />);

      const banner = screen.getByRole('banner', {
        name: 'Claim profile banner',
      });
      expect(banner).toHaveAttribute('aria-label', 'Claim profile banner');

      const cta = screen.getByTestId('claim-banner-cta');
      expect(cta).toHaveAttribute(
        'aria-label',
        'Claim profile for Test Artist'
      );
    });
  });

  describe('URL generation', () => {
    it('generates signup URL with redirect for signed-out users', () => {
      mockUseUser.mockReturnValue({ isSignedIn: false, isLoaded: true });

      render(<ClaimBanner {...defaultProps} />);

      const cta = screen.getByTestId('claim-banner-cta');
      expect(cta).toHaveAttribute(
        'href',
        '/signup?redirect_url=%2Ftestartist%2Fclaim%3Ftoken%3Dtest-claim-token-123'
      );
    });

    it('generates direct claim URL for signed-in users', () => {
      mockUseUser.mockReturnValue({ isSignedIn: true, isLoaded: true });

      render(<ClaimBanner {...defaultProps} />);

      const cta = screen.getByTestId('claim-banner-cta');
      expect(cta).toHaveAttribute(
        'href',
        '/testartist/claim?token=test-claim-token-123'
      );
    });

    it('defaults to signup URL while loading', () => {
      mockUseUser.mockReturnValue({ isSignedIn: false, isLoaded: false });

      render(<ClaimBanner {...defaultProps} />);

      const cta = screen.getByTestId('claim-banner-cta');
      expect(cta).toHaveAttribute(
        'href',
        '/signup?redirect_url=%2Ftestartist%2Fclaim%3Ftoken%3Dtest-claim-token-123'
      );
    });

    it('properly encodes special characters in claim token', () => {
      mockUseUser.mockReturnValue({ isSignedIn: false, isLoaded: true });

      render(
        <ClaimBanner
          claimToken='token-with-special/chars&stuff'
          profileHandle='test'
        />
      );

      const cta = screen.getByTestId('claim-banner-cta');
      const href = cta.getAttribute('href');
      // The claim path contains encoded token, then the whole redirect_url is encoded
      expect(href).toContain('token%3Dtoken-with-special');
    });
  });

  describe('responsive behavior', () => {
    it('renders mobile-friendly text', () => {
      mockUseUser.mockReturnValue({ isSignedIn: false, isLoaded: true });

      render(<ClaimBanner {...defaultProps} />);

      // Mobile text
      expect(
        screen.getByText('Your profile? Claim testartist')
      ).toBeInTheDocument();
      // Desktop text
      expect(
        screen.getByText('Is this your profile? Claim testartist')
      ).toBeInTheDocument();
    });
  });
});

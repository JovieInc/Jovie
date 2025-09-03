import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BillingPortalLink } from '@/components/molecules/BillingPortalLink';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';

// Mock the analytics
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  useFeatureFlag: vi.fn(),
  FEATURE_FLAGS: {
    BILLING_UPGRADE_DIRECT: 'billing.upgradeDirect',
  },
}));

// Mock fetch
global.fetch = vi.fn();

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: '',
  },
  writable: true,
});

describe('Billing Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockClear();
    window.location.href = '';
  });

  describe('BillingPortalLink Component', () => {
    it('renders with default props', () => {
      render(<BillingPortalLink />);
      expect(screen.getByText('Manage Billing')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('renders with custom children', () => {
      render(<BillingPortalLink>Custom Portal Text</BillingPortalLink>);
      expect(screen.getByText('Custom Portal Text')).toBeInTheDocument();
    });

    it('handles successful portal creation', async () => {
      const mockUrl = 'https://billing.stripe.com/session/test';
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: mockUrl }),
      });

      render(<BillingPortalLink />);
      const button = screen.getByRole('button');
      
      fireEvent.click(button);
      
      expect(button).toHaveTextContent('Loading...');
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/stripe/portal', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        expect(window.location.href).toBe(mockUrl);
      });
    });

    it('handles portal creation error', async () => {
      const errorMessage = 'Portal creation failed';
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: errorMessage }),
      });

      render(<BillingPortalLink />);
      const button = screen.getByRole('button');
      
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('handles network error', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      render(<BillingPortalLink />);
      const button = screen.getByRole('button');
      
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('UpgradeButton Component', () => {
    const mockUseFeatureFlag = vi.mocked(
      require('@/lib/analytics').useFeatureFlag
    );

    it('renders with default props', () => {
      mockUseFeatureFlag.mockReturnValue(false);
      render(<UpgradeButton />);
      expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('renders with custom children', () => {
      mockUseFeatureFlag.mockReturnValue(false);
      render(<UpgradeButton>Custom Upgrade Text</UpgradeButton>);
      expect(screen.getByText('Custom Upgrade Text')).toBeInTheDocument();
    });

    it('redirects to pricing page when feature flag is disabled', async () => {
      mockUseFeatureFlag.mockReturnValue(false);
      
      render(<UpgradeButton />);
      const button = screen.getByRole('button');
      
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(window.location.href).toBe('/pricing');
      });
    });

    it('validates priceId when direct upgrade is enabled but priceId is missing', async () => {
      mockUseFeatureFlag.mockReturnValue(true);
      
      render(<UpgradeButton />);
      const button = screen.getByRole('button');
      
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(screen.getByText('Price ID is required for direct checkout')).toBeInTheDocument();
      });
    });

    it('handles successful direct checkout', async () => {
      mockUseFeatureFlag.mockReturnValue(true);
      const mockUrl = 'https://checkout.stripe.com/session/test';
      const priceId = 'price_test123';
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: mockUrl }),
      });

      render(<UpgradeButton priceId={priceId} />);
      const button = screen.getByRole('button');
      
      fireEvent.click(button);
      
      expect(button).toHaveTextContent('Loading...');
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/stripe/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ priceId }),
        });
        expect(window.location.href).toBe(mockUrl);
      });
    });

    it('handles checkout creation error', async () => {
      mockUseFeatureFlag.mockReturnValue(true);
      const errorMessage = 'Checkout creation failed';
      const priceId = 'price_test123';
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: errorMessage }),
      });

      render(<UpgradeButton priceId={priceId} />);
      const button = screen.getByRole('button');
      
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('handles network error during checkout', async () => {
      mockUseFeatureFlag.mockReturnValue(true);
      const priceId = 'price_test123';
      
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      render(<UpgradeButton priceId={priceId} />);
      const button = screen.getByRole('button');
      
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });
});

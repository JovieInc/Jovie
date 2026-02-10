import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingPortalLink } from '@/components/molecules/BillingPortalLink';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { useFeatureFlag } from '@/lib/analytics';
import { renderWithQueryClient } from '../utils/test-utils';

// Mock the analytics
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  useFeatureFlag: vi.fn(),
  FEATURE_FLAGS: {
    BILLING_UPGRADE_DIRECT: 'billing.upgradeDirect',
  },
}));

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
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
    pushMock.mockClear();
  });

  describe('BillingPortalLink Component', () => {
    it('renders with default props', () => {
      renderWithQueryClient(<BillingPortalLink />);
      expect(screen.getByText('Manage Billing')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('renders with custom children', () => {
      renderWithQueryClient(
        <BillingPortalLink>Custom Portal Text</BillingPortalLink>
      );
      expect(screen.getByText('Custom Portal Text')).toBeInTheDocument();
    });

    it('handles successful portal creation', async () => {
      const mockUrl = 'https://billing.stripe.com/session/test';
      (global.fetch as any).mockResolvedValueOnce(
        new Response(JSON.stringify({ url: mockUrl }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      renderWithQueryClient(<BillingPortalLink />);
      const button = screen.getByRole('button');

      fireEvent.click(button);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/stripe/portal',
          expect.objectContaining({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            signal: expect.anything(),
          })
        );
        expect(window.location.href).toBe(mockUrl);
      });
    });

    it('handles portal creation error', async () => {
      (global.fetch as any).mockResolvedValueOnce(
        new Response('Bad Request', {
          status: 400,
          statusText: 'Bad Request',
        })
      );

      renderWithQueryClient(<BillingPortalLink />);
      const button = screen.getByRole('button');

      fireEvent.click(button);

      await waitFor(() => {
        expect(
          screen.getByText('Fetch failed: 400 Bad Request')
        ).toBeInTheDocument();
      });
    });

    it('handles network error', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      renderWithQueryClient(<BillingPortalLink />);
      const button = screen.getByRole('button');

      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('UpgradeButton Component', () => {
    const mockUseFeatureFlag = vi.mocked(useFeatureFlag);

    it('renders with default props', () => {
      mockUseFeatureFlag.mockReturnValue(false);
      renderWithQueryClient(<UpgradeButton />);
      expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('renders with custom children', () => {
      mockUseFeatureFlag.mockReturnValue(false);
      renderWithQueryClient(<UpgradeButton>Custom Upgrade Text</UpgradeButton>);
      expect(screen.getByText('Custom Upgrade Text')).toBeInTheDocument();
    });

    it('redirects to the billing remove-branding flow when feature flag is disabled', async () => {
      mockUseFeatureFlag.mockReturnValue(false);

      renderWithQueryClient(<UpgradeButton />);
      const button = screen.getByRole('button');

      fireEvent.click(button);

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith('/billing/remove-branding');
      });
    });

    it('validates priceId when direct upgrade is enabled but priceId is missing', async () => {
      mockUseFeatureFlag.mockReturnValue(true);

      renderWithQueryClient(<UpgradeButton />);
      const button = screen.getByRole('button');

      fireEvent.click(button);

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith('/billing/remove-branding');
      });
    });

    it('handles successful direct checkout', async () => {
      mockUseFeatureFlag.mockReturnValue(true);
      const mockUrl = 'https://checkout.stripe.com/session/test';
      const priceId = 'price_test123';

      (global.fetch as any).mockResolvedValueOnce(
        new Response(JSON.stringify({ url: mockUrl }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      renderWithQueryClient(<UpgradeButton priceId={priceId} />);
      const button = screen.getByRole('button');

      fireEvent.click(button);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/stripe/checkout',
          expect.objectContaining({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ priceId }),
            signal: expect.anything(),
          })
        );
        expect(window.location.href).toBe(mockUrl);
      });
    });

    it('handles checkout creation error', async () => {
      mockUseFeatureFlag.mockReturnValue(true);
      const priceId = 'price_test123';

      (global.fetch as any).mockResolvedValueOnce(
        new Response('Bad Request', {
          status: 400,
          statusText: 'Bad Request',
        })
      );

      renderWithQueryClient(<UpgradeButton priceId={priceId} />);
      const button = screen.getByRole('button');

      fireEvent.click(button);

      await waitFor(() => {
        expect(
          screen.getByText('Fetch failed: 400 Bad Request')
        ).toBeInTheDocument();
      });
    });

    it('handles network error during checkout', async () => {
      mockUseFeatureFlag.mockReturnValue(true);
      const priceId = 'price_test123';

      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      renderWithQueryClient(<UpgradeButton priceId={priceId} />);
      const button = screen.getByRole('button');

      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });
});

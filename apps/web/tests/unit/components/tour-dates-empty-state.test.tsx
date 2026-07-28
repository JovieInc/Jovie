import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TourDatesEmptyState } from '@/components/features/dashboard/organisms/tour-dates/TourDatesEmptyState';

vi.mock('@/lib/queries', () => ({
  useSaveBandsintownApiKeyMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useConnectBandsintownMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/**
 * JOV-4463: the Bandsintown setup flow lead visual must render the canonical
 * integration icon — an Icon name missing from the registry renders null and
 * leaves an empty rounded square in production.
 */
describe('TourDatesEmptyState', () => {
  describe('API key step', () => {
    it('renders a lead icon inside the visual chip (not an empty square)', () => {
      const { container } = render(
        <TourDatesEmptyState profileId='profile-1' hasApiKey={false} />
      );

      const chip = container.querySelector('.h-16.w-16');
      expect(chip).not.toBeNull();
      expect(chip?.querySelector('svg')).not.toBeNull();
    });

    it('preserves the secure-key disclosure', () => {
      render(<TourDatesEmptyState profileId='profile-1' hasApiKey={false} />);

      expect(
        screen.getByText(/encrypted and stored securely/i)
      ).toBeInTheDocument();
    });

    it('has one primary action', () => {
      render(<TourDatesEmptyState profileId='profile-1' hasApiKey={false} />);

      expect(
        screen.getByRole('button', { name: /save api key/i })
      ).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });
  });

  describe('artist connect step', () => {
    it('renders a lead icon inside the visual chip (not an empty square)', () => {
      const { container } = render(
        <TourDatesEmptyState profileId='profile-1' hasApiKey />
      );

      const chip = container.querySelector('.h-16.w-16');
      expect(chip).not.toBeNull();
      expect(chip?.querySelector('svg')).not.toBeNull();
    });

    it('has one primary action', () => {
      render(<TourDatesEmptyState profileId='profile-1' hasApiKey />);

      expect(
        screen.getByRole('button', { name: /connect bandsintown/i })
      ).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });
  });
});

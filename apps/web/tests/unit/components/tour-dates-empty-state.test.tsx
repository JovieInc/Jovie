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
    it('uses the shared empty-state anatomy with a rendered lead icon', () => {
      render(<TourDatesEmptyState profileId='profile-1' hasApiKey={false} />);

      const empty = screen.getByTestId('tour-dates-empty-state-api-key');
      expect(empty).toHaveAttribute(
        'data-empty-state-presentation',
        'workspace'
      );
      expect(
        screen.getByRole('heading', { name: 'Set Up Bandsintown Integration' })
      ).toBeInTheDocument();
      // JOV-4463: a missing Icon registry entry renders null.
      expect(empty.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
      expect(
        screen.getByRole('link', { name: 'artists.bandsintown.com' })
      ).toHaveAttribute('href', 'https://artists.bandsintown.com');
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
    it('uses the shared empty-state anatomy with a rendered lead icon', () => {
      render(<TourDatesEmptyState profileId='profile-1' hasApiKey />);

      const empty = screen.getByTestId('tour-dates-empty-state-connect');
      expect(empty).toHaveAttribute(
        'data-empty-state-presentation',
        'workspace'
      );
      expect(
        screen.getByRole('heading', { name: 'Connect Your Tour Dates' })
      ).toBeInTheDocument();
      expect(empty.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
      expect(
        screen.getByRole('textbox', { name: 'Bandsintown Artist Name' })
      ).toBeInTheDocument();
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

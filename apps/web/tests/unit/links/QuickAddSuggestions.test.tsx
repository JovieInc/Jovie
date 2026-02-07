/**
 * Unit tests for QuickAddSuggestions component
 *
 * Tests cover: rendering pills for platforms not yet added, filtering,
 * ordering by profile type (music vs social), and onPlatformSelect callback.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock SocialIcon to avoid heavy simple-icons import
vi.mock('@/components/atoms/SocialIcon', () => {
  const MockSocialIcon = ({ className }: { className?: string }) => (
    <div data-testid='social-icon' className={className} />
  );
  return {
    __esModule: true,
    SocialIcon: MockSocialIcon,
    getPlatformIcon: () => ({ hex: '000000' }),
    getPlatformIconMetadata: () => ({ hex: '000000' }),
  } as unknown as typeof import('@/components/atoms/SocialIcon');
});

import {
  MUSIC_FIRST_ORDER,
  SOCIAL_FIRST_ORDER,
  SUGGESTION_PILLS,
} from '@/components/dashboard/organisms/links/config';
// Import after mocks
import { QuickAddSuggestions } from '@/components/dashboard/organisms/links/QuickAddSuggestions';

describe('QuickAddSuggestions', () => {
  const mockOnPlatformSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render all suggestion pills when no platforms are added', () => {
      render(
        <QuickAddSuggestions
          existingPlatforms={new Set()}
          onPlatformSelect={mockOnPlatformSelect}
        />
      );

      // Should render container with data-testid
      const container = screen.getByTestId('quick-add-suggestions');
      expect(container).toBeInTheDocument();

      // Each suggestion pill should be rendered with its label
      for (const pill of SUGGESTION_PILLS) {
        expect(screen.getByText(pill.label)).toBeInTheDocument();
      }
    });

    it('should not render if all platforms are already added', () => {
      const allPlatformIds = new Set(SUGGESTION_PILLS.map(p => p.id));

      const { container } = render(
        <QuickAddSuggestions
          existingPlatforms={allPlatformIds}
          onPlatformSelect={mockOnPlatformSelect}
        />
      );

      // Should not render anything
      expect(container.firstChild).toBeNull();
    });

    it('should apply custom className', () => {
      render(
        <QuickAddSuggestions
          existingPlatforms={new Set()}
          onPlatformSelect={mockOnPlatformSelect}
          className='custom-class'
        />
      );

      const container = screen.getByTestId('quick-add-suggestions');
      expect(container).toHaveClass('custom-class');
    });
  });

  describe('filtering', () => {
    it('should filter out platforms that user has already added', () => {
      const existingPlatforms = new Set(['instagram', 'spotify']);

      render(
        <QuickAddSuggestions
          existingPlatforms={existingPlatforms}
          onPlatformSelect={mockOnPlatformSelect}
        />
      );

      // Should NOT show Instagram and Spotify
      expect(screen.queryByText('Instagram')).not.toBeInTheDocument();
      expect(screen.queryByText('Spotify')).not.toBeInTheDocument();

      // Should still show other platforms
      expect(screen.getByText('TikTok')).toBeInTheDocument();
      expect(screen.getByText('YouTube')).toBeInTheDocument();
    });

    it('should hide YouTube Music when YouTube is already added', () => {
      const existingPlatforms = new Set(['youtube']);

      render(
        <QuickAddSuggestions
          existingPlatforms={existingPlatforms}
          onPlatformSelect={mockOnPlatformSelect}
        />
      );

      // YouTube Music should be hidden because YouTube exists
      expect(screen.queryByText('YouTube Music')).not.toBeInTheDocument();
      expect(screen.queryByText('YouTube')).not.toBeInTheDocument();

      // Other platforms should still be visible
      expect(screen.getByText('Instagram')).toBeInTheDocument();
    });

    it('should show YouTube Music when YouTube is NOT added', () => {
      render(
        <QuickAddSuggestions
          existingPlatforms={new Set()}
          onPlatformSelect={mockOnPlatformSelect}
        />
      );

      expect(screen.getByText('YouTube Music')).toBeInTheDocument();
    });
  });

  describe('ordering', () => {
    it('should order by SOCIAL_FIRST_ORDER when isMusicProfile is false (default)', () => {
      render(
        <QuickAddSuggestions
          existingPlatforms={new Set()}
          isMusicProfile={false}
          onPlatformSelect={mockOnPlatformSelect}
        />
      );

      // Get all button elements (pills are interactive)
      const buttons = screen.getAllByRole('button');
      const labels = buttons.map(btn =>
        btn.textContent?.replace('+', '').trim()
      );

      // First platforms should be from SOCIAL_FIRST_ORDER
      // Social order: instagram, tiktok, youtube, twitter, spotify, apple-music, youtube-music, venmo, website
      const socialOrderLabels = SOCIAL_FIRST_ORDER.map(id => {
        const pill = SUGGESTION_PILLS.find(p => p.id === id);
        return pill?.label;
      }).filter(Boolean);

      // The first few pills should match social order
      for (let i = 0; i < Math.min(3, socialOrderLabels.length); i++) {
        expect(labels[i]).toBe(socialOrderLabels[i]);
      }
    });

    it('should order by MUSIC_FIRST_ORDER when isMusicProfile is true', () => {
      render(
        <QuickAddSuggestions
          existingPlatforms={new Set()}
          isMusicProfile={true}
          onPlatformSelect={mockOnPlatformSelect}
        />
      );

      // Get all button elements
      const buttons = screen.getAllByRole('button');
      const labels = buttons.map(btn =>
        btn.textContent?.replace('+', '').trim()
      );

      // Music order starts with: spotify-artist, spotify, apple-music, youtube, youtube-music
      const musicOrderLabels = MUSIC_FIRST_ORDER.map(id => {
        const pill = SUGGESTION_PILLS.find(p => p.id === id);
        return pill?.label;
      }).filter(Boolean);

      // The first few pills should match music order
      for (let i = 0; i < Math.min(3, musicOrderLabels.length); i++) {
        expect(labels[i]).toBe(musicOrderLabels[i]);
      }
    });

    it('should maintain order even when some platforms are filtered out', () => {
      // Filter out instagram and tiktok (first 2 in social order)
      const existingPlatforms = new Set(['instagram', 'tiktok']);

      render(
        <QuickAddSuggestions
          existingPlatforms={existingPlatforms}
          isMusicProfile={false}
          onPlatformSelect={mockOnPlatformSelect}
        />
      );

      const buttons = screen.getAllByRole('button');
      const labels = buttons.map(btn =>
        btn.textContent?.replace('+', '').trim()
      );

      // With instagram and tiktok filtered, youtube should be first (social order)
      expect(labels[0]).toBe('YouTube');
    });
  });

  describe('interaction', () => {
    it('should call onPlatformSelect with correct prefill URL when pill is clicked', () => {
      render(
        <QuickAddSuggestions
          existingPlatforms={new Set()}
          onPlatformSelect={mockOnPlatformSelect}
        />
      );

      // Click Instagram pill
      const instagramPill = screen.getByText('Instagram');
      fireEvent.click(instagramPill);

      expect(mockOnPlatformSelect).toHaveBeenCalledTimes(1);
      expect(mockOnPlatformSelect).toHaveBeenCalledWith(
        'https://instagram.com/'
      );
    });

    it('should call onPlatformSelect with search mode for spotify-artist', () => {
      render(
        <QuickAddSuggestions
          existingPlatforms={new Set()}
          isMusicProfile={true}
          onPlatformSelect={mockOnPlatformSelect}
        />
      );

      // Spotify Artist should be first in music order
      const spotifyArtistPill = screen.getByText('Spotify Artist');
      fireEvent.click(spotifyArtistPill);

      expect(mockOnPlatformSelect).toHaveBeenCalledWith(
        '__SEARCH_MODE__:spotify'
      );
    });

    it('should call onPlatformSelect with correct URL for various platforms', () => {
      render(
        <QuickAddSuggestions
          existingPlatforms={new Set()}
          onPlatformSelect={mockOnPlatformSelect}
        />
      );

      // Test TikTok
      fireEvent.click(screen.getByText('TikTok'));
      expect(mockOnPlatformSelect).toHaveBeenLastCalledWith(
        'https://www.tiktok.com/@'
      );

      // Test YouTube
      fireEvent.click(screen.getByText('YouTube'));
      expect(mockOnPlatformSelect).toHaveBeenLastCalledWith(
        'https://www.youtube.com/@'
      );

      // Test Twitter / X
      fireEvent.click(screen.getByText('X / Twitter'));
      expect(mockOnPlatformSelect).toHaveBeenLastCalledWith('https://x.com/');

      // Test Website
      fireEvent.click(screen.getByText('Website'));
      expect(mockOnPlatformSelect).toHaveBeenLastCalledWith('https://');
    });
  });

  describe('suffix rendering', () => {
    it('should render pills with + suffix', () => {
      render(
        <QuickAddSuggestions
          existingPlatforms={new Set()}
          onPlatformSelect={mockOnPlatformSelect}
        />
      );

      // Each pill should have the + suffix
      const buttons = screen.getAllByRole('button');
      for (const button of buttons) {
        expect(button.textContent).toContain('+');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty existingPlatforms Set', () => {
      render(
        <QuickAddSuggestions
          existingPlatforms={new Set()}
          onPlatformSelect={mockOnPlatformSelect}
        />
      );

      expect(screen.getByTestId('quick-add-suggestions')).toBeInTheDocument();
    });

    it('should handle unknown platform IDs in existingPlatforms gracefully', () => {
      const existingPlatforms = new Set([
        'unknown-platform',
        'another-unknown',
      ]);

      render(
        <QuickAddSuggestions
          existingPlatforms={existingPlatforms}
          onPlatformSelect={mockOnPlatformSelect}
        />
      );

      // Should still render all known suggestion pills
      expect(screen.getByText('Instagram')).toBeInTheDocument();
      expect(screen.getByText('TikTok')).toBeInTheDocument();
    });

    it('should default isMusicProfile to false', () => {
      // Without specifying isMusicProfile
      render(
        <QuickAddSuggestions
          existingPlatforms={new Set()}
          onPlatformSelect={mockOnPlatformSelect}
        />
      );

      const buttons = screen.getAllByRole('button');
      const labels = buttons.map(btn =>
        btn.textContent?.replace('+', '').trim()
      );

      // Should use social order (Instagram first)
      expect(labels[0]).toBe('Instagram');
    });
  });
});

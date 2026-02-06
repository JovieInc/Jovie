/**
 * Unit tests for SortableLinkItem component
 *
 * Tests cover: rendering, menu items, callbacks, visual states,
 * and edge cases for the draggable link row component.
 */

import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dnd-kit sortable
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: undefined,
    transition: undefined,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

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

// Import after mocks
import { SortableLinkItem } from '@/components/dashboard/organisms/links/SortableLinkItem';
import type { DetectedLink } from '@/lib/utils/platform-detection';

/**
 * Helper to create a mock DetectedLink
 */
function createMockLink(
  platformId: string,
  options: Partial<DetectedLink> = {}
): DetectedLink {
  return {
    platform: {
      id: platformId,
      name: platformId.charAt(0).toUpperCase() + platformId.slice(1),
      category: 'social' as const,
      icon: platformId,
      color: '#000000',
      placeholder: `https://${platformId}.com/user`,
    },
    normalizedUrl: `https://${platformId}.com/testuser`,
    originalUrl: `https://${platformId}.com/testuser`,
    suggestedTitle: platformId,
    isValid: true,
    ...options,
  };
}

/**
 * Wrapper for tests that need TooltipProvider
 */
const renderWithProviders = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

describe('SortableLinkItem', () => {
  const mockOnToggle = vi.fn();
  const mockOnRemove = vi.fn();
  const mockOnEdit = vi.fn();
  const mockOnAnyMenuOpen = vi.fn();
  const mockBuildPillLabel = vi.fn((link: DetectedLink) => link.platform.name);

  const defaultProps = {
    id: 'test-link-id',
    link: createMockLink('instagram'),
    index: 0,
    onToggle: mockOnToggle,
    onRemove: mockOnRemove,
    onEdit: mockOnEdit,
    visible: true,
    draggable: true,
    openMenuId: null as string | null,
    onAnyMenuOpen: mockOnAnyMenuOpen,
    isLastAdded: false,
    buildPillLabel: mockBuildPillLabel,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the link pill with platform name', () => {
      renderWithProviders(<SortableLinkItem {...defaultProps} />);

      // buildPillLabel should be called
      expect(mockBuildPillLabel).toHaveBeenCalledWith(defaultProps.link);
    });

    it('should render screen reader accessible URL display', () => {
      const link = createMockLink('instagram', {
        normalizedUrl: 'https://instagram.com/myhandle',
      });

      renderWithProviders(<SortableLinkItem {...defaultProps} link={link} />);

      // The sr-only div should contain the URL display
      const srOnlyElement = document.querySelector('.sr-only');
      expect(srOnlyElement).toBeInTheDocument();
      expect(srOnlyElement?.textContent).toContain('@myhandle');
    });

    it('should render with menu button for actions', () => {
      renderWithProviders(<SortableLinkItem {...defaultProps} />);

      const menuButton = screen.getByRole('button', {
        name: /Open actions for Instagram/i,
      });
      expect(menuButton).toBeInTheDocument();
    });
  });

  describe('visual states', () => {
    it('should show "Hidden" badge when not visible', () => {
      renderWithProviders(
        <SortableLinkItem {...defaultProps} visible={false} />
      );

      expect(screen.getByText('Hidden')).toBeInTheDocument();
    });

    it('should show "New" badge when isLastAdded is true', () => {
      renderWithProviders(
        <SortableLinkItem {...defaultProps} isLastAdded={true} />
      );

      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('should show "Needs fix" badge when link.isValid is false', () => {
      const invalidLink = createMockLink('instagram', { isValid: false });

      renderWithProviders(
        <SortableLinkItem {...defaultProps} link={invalidLink} />
      );

      expect(screen.getByText('Needs fix')).toBeInTheDocument();
    });

    it('should prioritize Hidden badge over other states', () => {
      // When both hidden and isLastAdded are true, should show Hidden
      renderWithProviders(
        <SortableLinkItem
          {...defaultProps}
          visible={false}
          isLastAdded={true}
        />
      );

      expect(screen.getByText('Hidden')).toBeInTheDocument();
      expect(screen.queryByText('New')).not.toBeInTheDocument();
    });

    it('should prioritize Hidden badge over error state', () => {
      const invalidLink = createMockLink('instagram', { isValid: false });

      renderWithProviders(
        <SortableLinkItem
          {...defaultProps}
          link={invalidLink}
          visible={false}
        />
      );

      expect(screen.getByText('Hidden')).toBeInTheDocument();
      expect(screen.queryByText('Needs fix')).not.toBeInTheDocument();
    });

    it('should prioritize error badge over New badge when visible', () => {
      const invalidLink = createMockLink('instagram', { isValid: false });

      renderWithProviders(
        <SortableLinkItem
          {...defaultProps}
          link={invalidLink}
          isLastAdded={true}
        />
      );

      expect(screen.getByText('Needs fix')).toBeInTheDocument();
      expect(screen.queryByText('New')).not.toBeInTheDocument();
    });
  });

  describe('menu items', () => {
    it('should show "Edit" menu item', () => {
      renderWithProviders(
        <SortableLinkItem {...defaultProps} openMenuId='test-link-id' />
      );

      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    it('should show "Hide" menu item when visible', () => {
      renderWithProviders(
        <SortableLinkItem
          {...defaultProps}
          visible={true}
          openMenuId='test-link-id'
        />
      );

      expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument();
    });

    it('should show "Show" menu item when hidden', () => {
      renderWithProviders(
        <SortableLinkItem
          {...defaultProps}
          visible={false}
          openMenuId='test-link-id'
        />
      );

      expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument();
    });

    it('should show "Delete" menu item', () => {
      renderWithProviders(
        <SortableLinkItem {...defaultProps} openMenuId='test-link-id' />
      );

      expect(
        screen.getByRole('button', { name: 'Delete' })
      ).toBeInTheDocument();
    });
  });

  describe('callbacks', () => {
    it('should call onEdit with index when Edit is clicked', () => {
      renderWithProviders(
        <SortableLinkItem
          {...defaultProps}
          openMenuId='test-link-id'
          index={2}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(mockOnEdit).toHaveBeenCalledTimes(1);
      expect(mockOnEdit).toHaveBeenCalledWith(2);
    });

    it('should call onToggle with index when Hide is clicked', () => {
      renderWithProviders(
        <SortableLinkItem
          {...defaultProps}
          openMenuId='test-link-id'
          index={3}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Hide' }));

      expect(mockOnToggle).toHaveBeenCalledTimes(1);
      expect(mockOnToggle).toHaveBeenCalledWith(3);
    });

    it('should call onToggle with index when Show is clicked', () => {
      renderWithProviders(
        <SortableLinkItem
          {...defaultProps}
          visible={false}
          openMenuId='test-link-id'
          index={4}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Show' }));

      expect(mockOnToggle).toHaveBeenCalledTimes(1);
      expect(mockOnToggle).toHaveBeenCalledWith(4);
    });

    it('should call onRemove with index when Delete is clicked', () => {
      renderWithProviders(
        <SortableLinkItem
          {...defaultProps}
          openMenuId='test-link-id'
          index={5}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(mockOnRemove).toHaveBeenCalledTimes(1);
      expect(mockOnRemove).toHaveBeenCalledWith(5);
    });

    it('should call onAnyMenuOpen when menu is opened', () => {
      renderWithProviders(<SortableLinkItem {...defaultProps} />);

      const menuButton = screen.getByRole('button', {
        name: /Open actions for Instagram/i,
      });
      fireEvent.click(menuButton);

      expect(mockOnAnyMenuOpen).toHaveBeenCalledWith('test-link-id');
    });
  });

  describe('secondary text (identity)', () => {
    it('should display @ identity when available', () => {
      const link = createMockLink('instagram', {
        normalizedUrl: 'https://instagram.com/coolartist',
      });

      renderWithProviders(<SortableLinkItem {...defaultProps} link={link} />);

      // The secondary text should show the identity
      expect(screen.getByText('@coolartist')).toBeInTheDocument();
    });

    it('should not show secondary text for non-@ identities', () => {
      const link = createMockLink('website', {
        platform: {
          id: 'website',
          name: 'Website',
          category: 'custom',
          icon: 'website',
          color: '#000000',
          placeholder: 'https://example.com',
        },
        normalizedUrl: 'https://example.com',
      });

      renderWithProviders(<SortableLinkItem {...defaultProps} link={link} />);

      // Website URLs don't start with @, so no secondary text shown
      expect(screen.queryByText(/@example/)).not.toBeInTheDocument();
    });
  });

  describe('draggable prop', () => {
    it('should be draggable when draggable is true (default)', () => {
      renderWithProviders(
        <SortableLinkItem {...defaultProps} draggable={true} />
      );

      // Component should render without error
      expect(mockBuildPillLabel).toHaveBeenCalled();
    });

    it('should still render when draggable is false', () => {
      renderWithProviders(
        <SortableLinkItem {...defaultProps} draggable={false} />
      );

      // Component should still render
      expect(mockBuildPillLabel).toHaveBeenCalled();
    });
  });

  describe('buildPillLabel', () => {
    it('should use buildPillLabel function to generate primary text', () => {
      const customBuildPillLabel = vi.fn(
        (link: DetectedLink) => `Custom: ${link.platform.name}`
      );

      renderWithProviders(
        <SortableLinkItem
          {...defaultProps}
          buildPillLabel={customBuildPillLabel}
        />
      );

      expect(customBuildPillLabel).toHaveBeenCalledWith(defaultProps.link);
    });
  });

  describe('edge cases', () => {
    it('should handle link with empty platform name', () => {
      const link = createMockLink('custom', {
        platform: {
          id: 'custom',
          name: '',
          category: 'custom',
          icon: 'custom',
          color: '#000000',
          placeholder: '',
        },
      });

      // Should not throw
      renderWithProviders(<SortableLinkItem {...defaultProps} link={link} />);
      expect(mockBuildPillLabel).toHaveBeenCalledWith(link);
    });

    it('should handle isValid being undefined (treated as true)', () => {
      // Use Partial to allow omitting isValid for this edge case test
      const link = {
        platform: {
          id: 'instagram',
          name: 'Instagram',
          category: 'social' as const,
          icon: 'instagram',
          color: '#E4405F',
          placeholder: '',
        },
        normalizedUrl: 'https://instagram.com/user',
        originalUrl: 'https://instagram.com/user',
        suggestedTitle: 'Instagram',
        // isValid is intentionally undefined to test fallback behavior
      } as DetectedLink;

      renderWithProviders(<SortableLinkItem {...defaultProps} link={link} />);

      // Should not show error badge
      expect(screen.queryByText('Needs fix')).not.toBeInTheDocument();
    });

    it('should handle multiple DSP link categories', () => {
      const dspLink = createMockLink('spotify', {
        platform: {
          id: 'spotify',
          name: 'Spotify',
          category: 'dsp',
          icon: 'spotify',
          color: '#1DB954',
          placeholder: 'https://open.spotify.com/artist/',
        },
      });

      renderWithProviders(
        <SortableLinkItem {...defaultProps} link={dspLink} />
      );

      // Should render DSP link correctly
      expect(mockBuildPillLabel).toHaveBeenCalledWith(dspLink);
    });

    it('should handle index 0 correctly', () => {
      renderWithProviders(
        <SortableLinkItem
          {...defaultProps}
          index={0}
          openMenuId='test-link-id'
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(mockOnEdit).toHaveBeenCalledWith(0);
    });
  });

  describe('menu open state', () => {
    it('should show menu is open when openMenuId matches id', () => {
      renderWithProviders(
        <SortableLinkItem {...defaultProps} openMenuId='test-link-id' />
      );

      // When menu is open, all menu items should be visible
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Delete' })
      ).toBeInTheDocument();
    });

    it('should not show menu items when openMenuId does not match', () => {
      renderWithProviders(
        <SortableLinkItem {...defaultProps} openMenuId='different-id' />
      );

      // Menu items should not be visible when menu is closed
      expect(
        screen.queryByRole('button', { name: 'Edit' })
      ).not.toBeInTheDocument();
    });
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the useArtistSearchQuery hook
vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: vi.fn(() => ({
    results: [],
    state: 'idle',
    error: null,
    search: vi.fn(),
    searchImmediate: vi.fn(),
    clear: vi.fn(),
    query: '',
    isPending: false,
  })),
}));

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

// Import after mocks
import { UniversalLinkInput } from '@/components/dashboard/molecules/universal-link-input';
import { useArtistSearchQuery } from '@/lib/queries';

const mockOnAdd = vi.fn();

describe('UniversalLinkInput Accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Search mode ARIA attributes', () => {
    it('should have proper combobox role and ARIA attributes when in search mode', async () => {
      const mockSearch = vi.fn();
      const mockClear = vi.fn();

      vi.mocked(useArtistSearchQuery).mockReturnValue({
        results: [
          {
            id: '1',
            name: 'Artist One',
            url: 'https://open.spotify.com/artist/1',
            popularity: 80,
            followers: 1000,
          },
        ],
        state: 'success',
        error: null,
        search: mockSearch,
        searchImmediate: vi.fn(),
        clear: mockClear,
        query: 'test',
        isPending: false,
      });

      render(
        <UniversalLinkInput
          onAdd={mockOnAdd}
          prefillUrl='__SEARCH_MODE__:spotify'
          onPrefillConsumed={vi.fn()}
        />
      );

      // Wait for search mode to activate
      await waitFor(() => {
        const input = screen.getByRole('combobox');
        expect(input).toBeInTheDocument();
      });

      const combobox = screen.getByRole('combobox');

      // Check ARIA attributes
      expect(combobox).toHaveAttribute(
        'aria-controls',
        'artist-search-results'
      );
      // aria-describedby is set when search mode is active
      // The combobox should have aria-controls at minimum
      expect(combobox).toHaveAttribute('aria-controls');
    });

    it('should have aria-expanded true when results are shown', async () => {
      vi.mocked(useArtistSearchQuery).mockReturnValue({
        results: [
          {
            id: '1',
            name: 'Artist One',
            url: 'https://open.spotify.com/artist/1',
            popularity: 80,
          },
        ],
        state: 'success',
        error: null,
        search: vi.fn(),
        searchImmediate: vi.fn(),
        clear: vi.fn(),
        query: 'test',
        isPending: false,
      });

      render(
        <UniversalLinkInput
          onAdd={mockOnAdd}
          prefillUrl='__SEARCH_MODE__:spotify'
          onPrefillConsumed={vi.fn()}
        />
      );

      await waitFor(() => {
        const input = screen.getByRole('combobox');
        expect(input).toBeInTheDocument();
      });

      // Type to trigger search and show results
      const input = screen.getByRole('combobox');
      await userEvent.type(input, 'test');

      // Focus should show results
      fireEvent.focus(input);

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'true');
      });
    });

    it('should have listbox role on results container', async () => {
      vi.mocked(useArtistSearchQuery).mockReturnValue({
        results: [
          {
            id: '1',
            name: 'Artist One',
            url: 'https://open.spotify.com/artist/1',
            popularity: 80,
          },
        ],
        state: 'success',
        error: null,
        search: vi.fn(),
        searchImmediate: vi.fn(),
        clear: vi.fn(),
        query: 'test',
        isPending: false,
      });

      render(
        <UniversalLinkInput
          onAdd={mockOnAdd}
          prefillUrl='__SEARCH_MODE__:spotify'
          onPrefillConsumed={vi.fn()}
        />
      );

      await waitFor(() => {
        const input = screen.getByRole('combobox');
        expect(input).toBeInTheDocument();
      });

      const input = screen.getByRole('combobox');
      await userEvent.type(input, 'test');
      fireEvent.focus(input);

      await waitFor(() => {
        const listbox = screen.getByRole('listbox');
        expect(listbox).toBeInTheDocument();
      });
    });

    it('should have option role on each result item', async () => {
      vi.mocked(useArtistSearchQuery).mockReturnValue({
        results: [
          {
            id: '1',
            name: 'Artist One',
            url: 'https://open.spotify.com/artist/1',
            popularity: 80,
          },
          {
            id: '2',
            name: 'Artist Two',
            url: 'https://open.spotify.com/artist/2',
            popularity: 60,
          },
        ],
        state: 'success',
        error: null,
        search: vi.fn(),
        searchImmediate: vi.fn(),
        clear: vi.fn(),
        query: 'test',
        isPending: false,
      });

      render(
        <UniversalLinkInput
          onAdd={mockOnAdd}
          prefillUrl='__SEARCH_MODE__:spotify'
          onPrefillConsumed={vi.fn()}
        />
      );

      await waitFor(() => {
        const input = screen.getByRole('combobox');
        expect(input).toBeInTheDocument();
      });

      const input = screen.getByRole('combobox');
      await userEvent.type(input, 'test');
      fireEvent.focus(input);

      await waitFor(() => {
        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(2);
      });
    });
  });

  describe('Screen reader status announcements', () => {
    it('should announce loading state', async () => {
      vi.mocked(useArtistSearchQuery).mockReturnValue({
        results: [],
        state: 'loading',
        error: null,
        search: vi.fn(),
        searchImmediate: vi.fn(),
        clear: vi.fn(),
        query: 'test',
        isPending: false,
      });

      render(
        <UniversalLinkInput
          onAdd={mockOnAdd}
          prefillUrl='__SEARCH_MODE__:spotify'
          onPrefillConsumed={vi.fn()}
        />
      );

      await waitFor(() => {
        const statusContainer = document.getElementById('artist-search-status');
        expect(statusContainer).toBeInTheDocument();
        expect(statusContainer).toHaveAttribute('aria-live', 'polite');
        expect(statusContainer).toHaveTextContent('Searching...');
      });
    });

    it('should announce empty results', async () => {
      vi.mocked(useArtistSearchQuery).mockReturnValue({
        results: [],
        state: 'empty',
        error: null,
        search: vi.fn(),
        searchImmediate: vi.fn(),
        clear: vi.fn(),
        query: 'test',
        isPending: false,
      });

      render(
        <UniversalLinkInput
          onAdd={mockOnAdd}
          prefillUrl='__SEARCH_MODE__:spotify'
          onPrefillConsumed={vi.fn()}
        />
      );

      await waitFor(() => {
        const status = screen.getByText('No artists found');
        expect(status).toBeInTheDocument();
      });
    });

    it('should announce result count', async () => {
      vi.mocked(useArtistSearchQuery).mockReturnValue({
        results: [
          {
            id: '1',
            name: 'Artist One',
            url: 'https://open.spotify.com/artist/1',
            popularity: 80,
          },
          {
            id: '2',
            name: 'Artist Two',
            url: 'https://open.spotify.com/artist/2',
            popularity: 60,
          },
        ],
        state: 'success',
        error: null,
        search: vi.fn(),
        searchImmediate: vi.fn(),
        clear: vi.fn(),
        query: 'test',
        isPending: false,
      });

      render(
        <UniversalLinkInput
          onAdd={mockOnAdd}
          prefillUrl='__SEARCH_MODE__:spotify'
          onPrefillConsumed={vi.fn()}
        />
      );

      await waitFor(() => {
        const status = screen.getByText(/2 artists found/);
        expect(status).toBeInTheDocument();
      });
    });
  });

  describe('Exit search mode button', () => {
    it('should have accessible label on exit button', async () => {
      vi.mocked(useArtistSearchQuery).mockReturnValue({
        results: [],
        state: 'idle',
        error: null,
        search: vi.fn(),
        searchImmediate: vi.fn(),
        clear: vi.fn(),
        query: '',
        isPending: false,
      });

      render(
        <UniversalLinkInput
          onAdd={mockOnAdd}
          prefillUrl='__SEARCH_MODE__:spotify'
          onPrefillConsumed={vi.fn()}
        />
      );

      await waitFor(() => {
        const exitButton = screen.getByRole('button', {
          name: /exit search mode/i,
        });
        expect(exitButton).toBeInTheDocument();
      });
    });
  });
});

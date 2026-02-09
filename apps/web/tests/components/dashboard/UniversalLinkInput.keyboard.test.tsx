import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UniversalLinkInput } from '@/components/dashboard/molecules/universal-link-input';

const getHostname = (value: string): string | null => {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

// Mock platform detection
vi.mock('@/lib/utils/platform-detection', () => ({
  detectPlatform: (url: string) => {
    const hostname = getHostname(url);
    if (hostname === 'spotify.com' || hostname?.endsWith('.spotify.com')) {
      return {
        platform: {
          id: 'spotify',
          name: 'Spotify',
          icon: 'spotify',
          color: '1DB954',
        },
        normalizedUrl: url,
        suggestedTitle: 'Spotify',
        isValid: true,
      };
    }
    if (hostname === 'instagram.com' || hostname?.endsWith('.instagram.com')) {
      return {
        platform: {
          id: 'instagram',
          name: 'Instagram',
          icon: 'instagram',
          color: 'E4405F',
        },
        normalizedUrl: url,
        suggestedTitle: 'Instagram',
        isValid: true,
      };
    }
    return null;
  },
}));

// Mock SocialIcon
vi.mock('@/components/atoms/SocialIcon', () => ({
  SocialIcon: ({ platform }: { platform: string }) => (
    <span data-testid={`icon-${platform}`} />
  ),
  getPlatformIcon: () => ({ hex: '1DB954' }),
  getPlatformIconMetadata: () => ({ hex: '1DB954' }),
}));

// Mock color utils
vi.mock('@/lib/utils/color', () => ({
  isBrandDark: () => false,
  contrastRatio: () => 10,
  getContrastTextOnBrand: () => '#0f172a',
}));

describe('UniversalLinkInput Keyboard Accessibility', () => {
  const mockOnAdd = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefills URL after platform selection', async () => {
    const user = userEvent.setup();
    render(<UniversalLinkInput onAdd={mockOnAdd} />);

    // Open dropdown
    const trigger = screen.getByRole('button', { name: /select platform/i });
    await user.click(trigger);

    // Select Spotify from dropdown
    const spotifyOption = await screen.findByText('Spotify');
    await user.click(spotifyOption);

    // Input should have prefilled URL
    const input = screen.getByRole('textbox');
    await waitFor(() => {
      expect(input).toHaveValue('https://open.spotify.com/artist/');
    });
  });

  it('supports fuzzy platform autosuggest + Enter to prefill', async () => {
    const user = userEvent.setup();
    render(<UniversalLinkInput onAdd={mockOnAdd} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'insta');

    // autosuggest should appear and the input should become a combobox
    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeInTheDocument();

    const listbox = screen.getByRole('listbox', {
      name: /platform suggestions/i,
    });
    expect(listbox).toBeInTheDocument();

    // Press Enter to select the highlighted suggestion (defaults to first)
    await user.keyboard('{Enter}');

    await waitFor(() => {
      // Instagram prefill
      expect(screen.getByRole('textbox')).toHaveValue('https://instagram.com/');
    });
  });

  it('allows typing handle after platform selection', async () => {
    const user = userEvent.setup();
    render(<UniversalLinkInput onAdd={mockOnAdd} />);

    // Open dropdown
    const trigger = screen.getByRole('button', { name: /select platform/i });
    await user.click(trigger);

    // Select Spotify from dropdown
    const spotifyOption = await screen.findByText('Spotify');
    await user.click(spotifyOption);

    // Wait for prefill
    const input = screen.getByRole('textbox');
    await waitFor(() => {
      expect(input).toHaveValue('https://open.spotify.com/artist/');
    });

    // Click input and type handle - cursor should be at end
    await user.click(input);
    await user.type(input, 'testhandle');
    expect(input).toHaveValue('https://open.spotify.com/artist/testhandle');
  });

  it('supports Enter key to add valid link', async () => {
    const user = userEvent.setup();
    render(<UniversalLinkInput onAdd={mockOnAdd} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'https://open.spotify.com/artist/123');

    // Press Enter to add
    await user.keyboard('{Enter}');

    expect(mockOnAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: expect.objectContaining({ id: 'spotify' }),
      })
    );
  });

  it('blocks Enter when URL has unsafe scheme', async () => {
    const user = userEvent.setup();
    render(<UniversalLinkInput onAdd={mockOnAdd} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'javascript:alert(1)');

    await user.keyboard('{Enter}');

    expect(mockOnAdd).not.toHaveBeenCalled();
  });

  it('supports Escape key to clear input', async () => {
    const user = userEvent.setup();
    render(<UniversalLinkInput onAdd={mockOnAdd} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'https://spotify.com/test');
    expect(input).toHaveValue('https://spotify.com/test');

    // Press Escape to clear
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
  });

  it('dropdown trigger has visible focus ring', async () => {
    const user = userEvent.setup();
    render(<UniversalLinkInput onAdd={mockOnAdd} />);

    const trigger = screen.getByRole('button', { name: /select platform/i });

    // Tab to focus the trigger
    await user.tab();
    expect(trigger).toHaveFocus();

    // Check focus-visible classes are applied
    expect(trigger.className).toContain('focus-visible:ring-2');
  });

  it('clear button has visible focus ring', async () => {
    const user = userEvent.setup();
    render(<UniversalLinkInput onAdd={mockOnAdd} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'https://spotify.com/test');

    // Find clear button
    const clearButton = screen.getByRole('button', { name: /clear input/i });
    expect(clearButton.className).toContain('focus-visible:ring-2');
  });

  it('Tab navigates through all interactive elements', async () => {
    const user = userEvent.setup();
    render(<UniversalLinkInput onAdd={mockOnAdd} />);

    // Type to show preview with buttons
    const input = screen.getByRole('textbox');
    await user.type(input, 'https://open.spotify.com/artist/123');

    // Tab through elements
    await user.tab(); // to clear button in input
    expect(screen.getByRole('button', { name: /clear input/i })).toHaveFocus();

    // Next tab should move focus out of the component since preview controls live in the list
    await user.tab();
    expect(document.body).toHaveFocus();
  });

  it('dropdown opens with Enter/Space and navigates with arrow keys', async () => {
    const user = userEvent.setup();
    render(<UniversalLinkInput onAdd={mockOnAdd} />);

    const trigger = screen.getByRole('button', { name: /select platform/i });
    trigger.focus();

    // Open with Enter
    await user.keyboard('{Enter}');

    // Dropdown should be open
    await waitFor(() => {
      expect(screen.getByText('Spotify')).toBeInTheDocument();
    });

    // Navigate with arrow down
    await user.keyboard('{ArrowDown}');

    // Close with Escape
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByText('Apple Music')).not.toBeInTheDocument();
    });
  });
});

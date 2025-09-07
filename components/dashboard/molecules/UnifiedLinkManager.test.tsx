import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { type DetectedLink, getPlatform } from '@/lib/utils/platform-detection';
import { UnifiedLinkManager } from './UnifiedLinkManager';

// Mock the useToast hook
const mockShowToast = vi.fn();
const mockHideToast = vi.fn();
const mockClearToasts = vi.fn();

vi.mock('@/components/ui/ToastContainer', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useToast: vi.fn(() => ({
      showToast: mockShowToast,
      hideToast: mockHideToast,
      clearToasts: mockClearToasts,
    })),
  };
});

// Mock the LinkManager component and capture props
let linkManagerProps: Record<string, any> = {};
vi.mock('./LinkManager', () => ({
  LinkManager: (props: Record<string, any>) => {
    linkManagerProps = props;
    return <div data-testid='link-manager'>Mocked LinkManager</div>;
  },
}));

// Mock platform detection data
const mockSocialLink: DetectedLink = {
  platform: {
    id: 'instagram',
    name: 'Instagram',
    category: 'social',
    icon: 'instagram',
    color: 'E4405F',
    placeholder: 'https://instagram.com/username',
  },
  normalizedUrl: 'https://instagram.com/artist',
  originalUrl: 'https://instagram.com/artist',
  suggestedTitle: 'Instagram',
  isValid: true,
};

const mockMusicLink: DetectedLink = {
  platform: {
    id: 'spotify',
    name: 'Spotify',
    category: 'dsp',
    icon: 'spotify',
    color: '1DB954',
    placeholder: 'https://open.spotify.com/artist/...',
  },
  normalizedUrl: 'https://open.spotify.com/artist/123',
  originalUrl: 'https://spotify.com/artist/123',
  suggestedTitle: 'Spotify Artist',
  isValid: true,
};

const mockCustomLink: DetectedLink = {
  platform: {
    id: 'custom',
    name: 'Custom Link',
    category: 'custom',
    icon: 'link',
    color: '6B7280',
    placeholder: 'https://example.com',
  },
  normalizedUrl: 'https://example.com',
  originalUrl: 'https://example.com',
  suggestedTitle: 'Custom',
  isValid: true,
};

describe('UnifiedLinkManager Token Usage', () => {
  const renderWithToastProvider = (ui: React.ReactElement) => {
    return render(<ToastProvider>{ui}</ToastProvider>);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    linkManagerProps = {};
  });

  it('uses text-primary-token for main headings', () => {
    const onLinksChangeMock = vi.fn();
    const { container } = renderWithToastProvider(
      <UnifiedLinkManager initialLinks={[]} onLinksChange={onLinksChangeMock} />
    );

    // Check that main heading uses text-primary-token
    const mainHeading = screen.getByText('✨ Add Any Link');
    expect(mainHeading).toHaveClass('text-primary-token');

    // Verify the class is in the DOM
    expect(container.querySelector('.text-primary-token')).toBeInTheDocument();
  });

  it('uses text-secondary-token for descriptions and counters', () => {
    const onLinksChangeMock = vi.fn();
    const { container } = renderWithToastProvider(
      <UnifiedLinkManager initialLinks={[]} onLinksChange={onLinksChangeMock} />
    );

    // Check that description uses text-secondary-token
    const description = screen.getByText(/Paste a link.*detect and organize/);
    expect(description).toHaveClass('text-secondary-token');

    // Verify the class is in the DOM
    expect(
      container.querySelector('.text-secondary-token')
    ).toBeInTheDocument();
  });

  it('uses text-primary-token for category headings when links are present', () => {
    const onLinksChangeMock = vi.fn();
    const initialLinks = [
      {
        ...mockSocialLink,
        id: 'social_1',
        title: 'Instagram',
        isVisible: true,
        order: 0,
      },
      {
        ...mockMusicLink,
        id: 'music_1',
        title: 'Spotify',
        isVisible: true,
        order: 1,
      },
      {
        ...mockCustomLink,
        id: 'custom_1',
        title: 'My Website',
        isVisible: true,
        order: 2,
      },
    ];

    const { container } = renderWithToastProvider(
      <UnifiedLinkManager
        initialLinks={initialLinks}
        onLinksChange={onLinksChangeMock}
      />
    );

    // Check "Your Links" heading
    const yourLinksHeading = screen.getByText('Your Links');
    expect(yourLinksHeading).toHaveClass('text-primary-token');

    // Check category headings
    const socialHeading = screen.getByText('Social');
    expect(socialHeading).toHaveClass('text-primary-token');

    const musicHeading = screen.getByText('Music');
    expect(musicHeading).toHaveClass('text-primary-token');

    const customHeading = screen.getByText('Custom');
    expect(customHeading).toHaveClass('text-primary-token');

    // Verify no old text-primary classes exist
    expect(
      container.querySelector('.text-primary:not(.text-primary-token)')
    ).not.toBeInTheDocument();
  });

  it('uses text-secondary-token for counters and status text', () => {
    const onLinksChangeMock = vi.fn();
    const initialLinks = [
      {
        ...mockSocialLink,
        id: 'social_1',
        title: 'Instagram',
        isVisible: true,
        order: 0,
      },
      {
        ...mockSocialLink,
        id: 'social_2',
        title: 'TikTok',
        isVisible: false, // Hidden link
        order: 1,
      },
    ];

    const { container } = renderWithToastProvider(
      <UnifiedLinkManager
        initialLinks={initialLinks}
        onLinksChange={onLinksChangeMock}
      />
    );

    // Find all text-secondary-token elements
    const secondaryTokenElements = container.querySelectorAll(
      '.text-secondary-token'
    );
    expect(secondaryTokenElements.length).toBeGreaterThan(0);

    // Verify no old text-secondary classes exist (excluding text-secondary-token)
    expect(
      container.querySelector('.text-secondary:not(.text-secondary-token)')
    ).not.toBeInTheDocument();
  });

  it('has no legacy text-primary or text-secondary classes', () => {
    const onLinksChangeMock = vi.fn();
    const initialLinks = [
      {
        ...mockSocialLink,
        id: 'social_1',
        title: 'Instagram',
        isVisible: true,
        order: 0,
      },
    ];

    const { container } = renderWithToastProvider(
      <UnifiedLinkManager
        initialLinks={initialLinks}
        onLinksChange={onLinksChangeMock}
      />
    );

    // Check that no legacy classes exist
    const legacyPrimary = Array.from(
      container.querySelectorAll('[class*="text-primary"]')
    ).filter(
      el =>
        el.className.includes('text-primary') &&
        !el.className.includes('text-primary-token')
    );
    expect(legacyPrimary).toHaveLength(0);

    const legacySecondary = Array.from(
      container.querySelectorAll('[class*="text-secondary"]')
    ).filter(
      el =>
        el.className.includes('text-secondary') &&
        !el.className.includes('text-secondary-token')
    );
    expect(legacySecondary).toHaveLength(0);
  });

  it('renders suggested platforms when high-value links are missing', () => {
    const onLinksChangeMock = vi.fn();
    renderWithToastProvider(
      <UnifiedLinkManager initialLinks={[]} onLinksChange={onLinksChangeMock} />
    );

    expect(screen.getByTestId('suggestions-row')).toBeInTheDocument();

    const spotifyButton = screen.getByLabelText('Spotify');
    fireEvent.click(spotifyButton);
    expect(linkManagerProps.prefillUrl).toBe(
      'https://open.spotify.com/artist/...'
    );
  });

  it('removes suggestion row after suggested link added', () => {
    const onLinksChangeMock = vi.fn();
    const makeLink = (id: string) => {
      const platform = getPlatform(id)!;
      return {
        id,
        platform,
        title: platform.name,
        normalizedUrl: platform.placeholder,
        originalUrl: platform.placeholder,
        isVisible: true,
        order: 0,
      };
    };
    const initialLinks = ['apple-music', 'instagram', 'tiktok', 'youtube'].map(
      makeLink
    );

    renderWithToastProvider(
      <UnifiedLinkManager
        initialLinks={initialLinks}
        onLinksChange={onLinksChangeMock}
      />
    );

    expect(screen.getByTestId('suggestions-row')).toBeInTheDocument();

    act(() => {
      linkManagerProps.onLinksChange([...initialLinks, makeLink('spotify')]);
    });

    expect(screen.queryByTestId('suggestions-row')).not.toBeInTheDocument();
  });
});

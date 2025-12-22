import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SocialBar } from '@/components/organisms/SocialBar';
import type { LegacySocialLink } from '@/types/db';

// Mock fetch for API calls
global.fetch = vi.fn();

describe('SocialBar', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockSocialLinks: LegacySocialLink[] = [
    {
      id: '1',
      artist_id: 'test-artist',
      platform: 'instagram',
      url: 'https://instagram.com/test',
      clicks: 0,
      created_at: '2023-01-01T00:00:00Z',
    },
    {
      id: '2',
      artist_id: 'test-artist',
      platform: 'twitter',
      url: 'https://twitter.com/test',
      clicks: 0,
      created_at: '2023-01-01T00:00:00Z',
    },
  ];

  it('renders social icons with cursor pointer styling', () => {
    render(
      <SocialBar
        handle='test-artist'
        artistName='Test Artist'
        socialLinks={mockSocialLinks}
      />
    );

    const socialLinksElements = screen.getAllByRole('link');
    expect(socialLinksElements).toHaveLength(2);

    socialLinksElements.forEach(link => {
      expect(link).toHaveClass('cursor-pointer');
    });
  });

  it('hides container when no social links provided', () => {
    const { container } = render(
      <SocialBar
        handle='test-artist'
        artistName='Test Artist'
        socialLinks={[]}
      />
    );

    const socialContainer = container.firstChild as HTMLElement;
    expect(socialContainer).toHaveClass('hidden');
  });

  it('applies proper accessibility attributes', () => {
    render(
      <SocialBar
        handle='test-artist'
        artistName='Test Artist'
        socialLinks={mockSocialLinks}
      />
    );

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('title', 'Follow on instagram');
    expect(links[0]).toHaveAttribute(
      'aria-label',
      'Follow Test Artist on instagram'
    );
    expect(links[1]).toHaveAttribute('title', 'Follow on twitter');
    expect(links[1]).toHaveAttribute(
      'aria-label',
      'Follow Test Artist on twitter'
    );
  });
});

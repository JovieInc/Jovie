import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatorProfile } from '@/components/creator/CreatorProfile';
import { MAX_SOCIAL_LINKS } from '@/constants/app';

vi.mock('@/hooks/useCreator', () => {
  return {
    useCreator: vi.fn(),
  };
});

const { useCreator } = await import('@/hooks/useCreator');

describe('CreatorProfile social links cap and visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders at most MAX_SOCIAL_LINKS and filters inactive', () => {
    const total = MAX_SOCIAL_LINKS + 3;

    const socialLinks = Array.from({ length: total }).map((_, i) => ({
      id: `link_${i}`,
      url: `https://example.com/${i}`,
      platform: `platform_${i}`,
      isActive: i % 2 === 0, // half active, half inactive
      displayText: `Platform ${i}`,
    }));

    // Configure mock
    (useCreator as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      creator: {
        username: 'testuser',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
        bio: 'Bio',
        socialLinks,
      },
      loading: false,
      error: null,
    });

    render(<CreatorProfile username='testuser' />);

    // Only active links should be considered, and capped at MAX_SOCIAL_LINKS
    const activeCount = socialLinks.filter(l => l.isActive !== false).length;
    const expected = Math.min(activeCount, MAX_SOCIAL_LINKS);

    const links = screen.getAllByRole('link', { name: /platform/i });
    expect(links.length).toBe(expected);

    // Ensure none of the inactive ones appear (quick spot check)
    socialLinks
      .filter(l => l.isActive === false)
      .forEach(l => {
        expect(
          screen.queryByRole('link', { name: new RegExp(l.platform, 'i') })
        ).toBeNull();
      });
  });
});

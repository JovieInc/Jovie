import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SocialLinksCell } from '@/components/organisms/table/molecules/SocialLinksCell';

describe('SocialLinksCell', () => {
  it('shows icon rail summary count for social links', () => {
    render(
      <SocialLinksCell
        filterPlatformType='social'
        links={[
          {
            id: '1',
            url: 'https://instagram.com/artist',
            platform: 'instagram',
            platformType: 'social',
            displayText: '@artist',
          },
          {
            id: '2',
            url: 'https://tiktok.com/@artist',
            platform: 'tiktok',
            platformType: 'social',
            displayText: '@artist',
          },
        ]}
      />
    );

    // Summary pill shows count as visible text, full label in title attribute
    expect(screen.getByTitle('2 social links')).toBeInTheDocument();
  });

  it('shows overflow count in summary label', () => {
    render(
      <SocialLinksCell
        filterPlatformType='music'
        maxLinks={2}
        links={[
          {
            id: '1',
            url: 'https://open.spotify.com/artist/abc',
            platform: 'spotify',
            platformType: 'music',
            displayText: 'The Long Artist Name',
          },
          {
            id: '2',
            url: 'https://music.apple.com/us/artist/id123',
            platform: 'apple_music',
            platformType: 'music',
            displayText: 'The Long Artist Name',
          },
          {
            id: '3',
            url: 'https://soundcloud.com/theartist',
            platform: 'soundcloud',
            platformType: 'music',
            displayText: 'The Long Artist Name',
          },
        ]}
      />
    );

    // Summary pill shows count in title attribute
    expect(screen.getByTitle('3 social links')).toBeInTheDocument();
  });

  it('opens link in a new tab when pill is clicked', () => {
    const openSpy = vi.spyOn(globalThis, 'open').mockImplementation(() => null);

    render(
      <SocialLinksCell
        links={[
          {
            id: '1',
            url: 'https://instagram.com/artist',
            platform: 'instagram',
            platformType: 'social',
            displayText: '@artist',
          },
        ]}
      />
    );

    screen.getByRole('button', { name: 'Select Instagram' }).click();

    expect(openSpy).toHaveBeenCalledWith(
      'https://instagram.com/artist',
      '_blank',
      'noopener,noreferrer'
    );

    openSpy.mockRestore();
  });

  it('falls back to inferred social platform when platformType is missing', () => {
    const openSpy = vi.spyOn(globalThis, 'open').mockImplementation(() => null);

    render(
      <SocialLinksCell
        links={[
          {
            id: 'fb-1',
            url: 'https://facebook.com/artist',
            platform: 'facebook',
            platformType: null,
            displayText: 'Artist Page',
          },
        ]}
      />
    );

    screen.getByRole('button', { name: 'Select Facebook' }).click();

    expect(openSpy).toHaveBeenCalledWith(
      'https://facebook.com/artist',
      '_blank',
      'noopener,noreferrer'
    );

    openSpy.mockRestore();
  });
});

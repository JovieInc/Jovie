import '../../fixtures/release-landing-page';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';
import { NEVER_SAY_A_WORD_OPAQUE_PROFILE_FIXTURE } from '@/lib/profile/opaque-internal-profile-handle';

import { defaultProps } from '../../fixtures/release-landing-page-data';

// ---------------------------------------------------------------------------
// Tests (@critical)
// ---------------------------------------------------------------------------
describe('@critical ReleaseLandingPage', () => {
  it('renders release title and artist name', () => {
    render(<ReleaseLandingPage {...defaultProps} />);
    expect(screen.getByText('Midnight Drive')).toBeDefined();
    expect(screen.getByText('Tim White')).toBeDefined();
  });

  it('uses the shared compact smart-link hero title class', () => {
    render(<ReleaseLandingPage {...defaultProps} />);

    const title = screen.getByRole('heading', { name: 'Midnight Drive' });
    expect(title).toHaveClass('text-2xl', 'tracking-tight');
    expect(title).not.toHaveClass('text-[28px]', 'text-3xl', 'text-4xl');
  });

  it('keeps one fixed action and switches its URL when the fan chooses another provider', async () => {
    render(<ReleaseLandingPage {...defaultProps} />);
    const buttons = screen.getAllByTestId('provider-button');
    expect(buttons.length).toBe(1);
    expect(buttons[0].getAttribute('data-href')).toBe(
      'https://open.spotify.com/track/1?utm_source=jovie'
    );
    fireEvent.click(screen.getByRole('option', { name: 'Apple Music' }));
    await waitFor(() =>
      expect(screen.getByTestId('provider-button')).toHaveAttribute(
        'data-href',
        'https://music.apple.com/track/1?utm_source=jovie'
      )
    );
  });

  it('makes the first available DSP the Stream Now primary action', () => {
    render(<ReleaseLandingPage {...defaultProps} />);
    const buttons = screen.getAllByTestId('provider-button');

    expect(buttons[0]).toHaveAttribute('data-label', 'Stream Now');
    expect(buttons[0]).toHaveAttribute('data-primary', 'true');
    expect(
      screen.getByRole('group', { name: 'Choose a streaming service' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Apple Music' })
    ).toBeInTheDocument();
  });

  it('keeps downloads in the secondary menu when streaming links exist', () => {
    render(
      <ReleaseLandingPage
        {...defaultProps}
        downloadUrl='/timwhite/midnight-drive/download'
        soundsUrl='/timwhite/midnight-drive/sounds'
        initialMenuOpen
      />
    );

    const download = screen.getByRole('link', { name: 'Download' });
    expect(download).toHaveAttribute(
      'href',
      '/timwhite/midnight-drive/download?utm_source=jovie'
    );
    expect(screen.getByText('Use this sound')).toBeDefined();
  });

  it('appends utm_source=jovie to provider links when no utmParams prop is given', () => {
    render(<ReleaseLandingPage {...defaultProps} />);
    const buttons = screen.getAllByTestId('provider-button');
    for (const btn of buttons) {
      expect(btn.getAttribute('data-href')).toContain('utm_source=jovie');
    }
  });

  it('omits preview playback while keeping the streaming action', () => {
    const legacyPreviewRelease = {
      ...defaultProps.release,
      previewUrl: 'https://example.com/preview.mp3',
    };
    render(
      <ReleaseLandingPage {...defaultProps} release={legacyPreviewRelease} />
    );

    expect(screen.queryByTestId('audio-preview')).not.toBeInTheDocument();
    expect(screen.getByTestId('provider-button')).toHaveAttribute(
      'data-href',
      'https://open.spotify.com/track/1?utm_source=jovie'
    );
  });

  it('shows empty state when no providers have URLs', () => {
    const noUrlProviders = [
      {
        key: 'spotify' as const,
        label: 'Spotify',
        accent: '#1DB954',
        url: null,
      },
      {
        key: 'apple_music' as const,
        label: 'Apple Music',
        accent: '#FA2D48',
        url: null,
      },
    ];
    render(<ReleaseLandingPage {...defaultProps} providers={noUrlProviders} />);
    expect(screen.getByText('No streaming links available yet.')).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Visit artist profile' })
    ).toHaveAttribute('href', '/timwhite');
    expect(
      screen.getByRole('button', { name: 'Share release' })
    ).toBeInTheDocument();
  });

  it('artist name links to /${handle} when handle exists', () => {
    render(<ReleaseLandingPage {...defaultProps} />);
    const artistLink = screen.getByText('Tim White');
    expect(artistLink.closest('a')?.getAttribute('href')).toBe('/timwhite');
  });

  it('Never Say a Word artist name links to canonical /tim not the opaque ID', () => {
    const fixture = NEVER_SAY_A_WORD_OPAQUE_PROFILE_FIXTURE;
    render(
      <ReleaseLandingPage
        {...defaultProps}
        artist={{
          name: fixture.ownerName,
          handle: fixture.ownerHandle,
          avatarUrl: null,
        }}
        primaryArtists={[
          { name: fixture.artistName, handle: fixture.opaqueHandle },
        ]}
      />
    );

    const artistLink = screen.getByText(fixture.artistName);
    expect(artistLink.closest('a')?.getAttribute('href')).toBe(
      `/${fixture.ownerHandle}`
    );
    expect(artistLink.closest('a')?.getAttribute('href')).not.toBe(
      fixture.opaqueProfilePath
    );
  });

  it('artist name is plain text when handle is null', () => {
    render(
      <ReleaseLandingPage
        {...defaultProps}
        artist={{ name: 'Ghost Artist', handle: null, avatarUrl: null }}
      />
    );
    const el = screen.getByText('Ghost Artist');
    expect(el.tagName).toBe('SPAN');
    expect(el.closest('a')).toBeNull();
  });

  it('credits drawer renders when credits exist', () => {
    const credits = [
      {
        role: 'Producer',
        entries: [{ name: 'Jane Doe', handle: null }],
      },
    ];
    render(<ReleaseLandingPage {...defaultProps} credits={credits} />);
    expect(screen.getByTestId('credits-drawer')).toBeDefined();
  });

  it('claim banner renders when claimBanner prop is provided', () => {
    render(
      <ReleaseLandingPage
        {...defaultProps}
        claimBanner={{ profileId: 'p-123', username: 'timwhite' }}
      />
    );
    expect(screen.getByText('Is this your music?')).toBeDefined();
    expect(screen.getByText('Claim profile')).toBeDefined();
  });

  it('renders every canonical primary artist in the byline', () => {
    render(
      <ReleaseLandingPage
        {...defaultProps}
        primaryArtists={[
          { name: 'Tim White', handle: 'timwhite' },
          { name: 'LYNX', handle: null },
        ]}
      />
    );

    const byline = screen.getByTestId('smart-link-artist-byline');
    expect(byline.textContent).toBe('Tim White and LYNX');
    expect(screen.getByText('Tim White').closest('a')).toHaveAttribute(
      'href',
      '/timwhite'
    );
    expect(screen.getByText('LYNX').tagName).toBe('SPAN');
    expect(screen.getByText('LYNX').closest('a')).toBeNull();
  });

  it.each([
    [{ name: ' DJ Nova ', handle: 'djnova' }],
    [
      { name: 'DJ Nova', handle: 'djnova' },
      { name: ' DJ Nova ', handle: null },
    ],
    [
      { name: 'DJ Nova', handle: 'djnova' },
      { name: 'DJ Nova', handle: null },
    ],
  ])(
    'preserves the first featured profile link after name normalization: %j',
    (...featured) => {
      render(
        <ReleaseLandingPage {...defaultProps} featuredArtists={featured} />
      );

      const links = screen.getAllByRole('link', { name: 'DJ Nova' });
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute('href', '/djnova');
      expect(links[0]).toHaveTextContent(/^DJ Nova$/);
    }
  );

  it('featured artists line renders "feat." with linked names', () => {
    const featured = [
      { name: 'DJ Nova', handle: 'djnova' },
      { name: 'MC Flow', handle: null },
    ];
    render(<ReleaseLandingPage {...defaultProps} featuredArtists={featured} />);
    expect(screen.getByText('feat.')).toBeDefined();
    // DJ Nova should be a link
    const novaEl = screen.getByText('DJ Nova');
    expect(novaEl.closest('a')?.getAttribute('href')).toBe('/djnova');
    // MC Flow should be plain text
    const flowEl = screen.getByText('MC Flow');
    expect(flowEl.tagName).toBe('SPAN');
    expect(flowEl.closest('a')).toBeNull();
  });

  it('exposes Take Me Over featured and remixer roles without substituting either', () => {
    render(
      <ReleaseLandingPage
        {...defaultProps}
        release={{
          ...defaultProps.release,
          title: 'Take Me Over (Austin Leeds Remix)',
        }}
        primaryArtists={[{ name: 'Tim White', handle: 'timwhite' }]}
        featuredArtists={[{ name: 'Erica Gibson', handle: null }]}
        credits={[
          {
            role: 'main_artist',
            label: 'Primary artist',
            entries: [
              {
                artistId: 'tim',
                name: 'Tim White',
                handle: 'timwhite',
                role: 'main_artist',
                position: 0,
              },
            ],
          },
          {
            role: 'featured_artist',
            label: 'Featured artist',
            entries: [
              {
                artistId: 'erica',
                name: 'Erica Gibson',
                handle: null,
                role: 'featured_artist',
                position: 1,
              },
            ],
          },
          {
            role: 'remixer',
            label: 'Remixer',
            entries: [
              {
                artistId: 'austin',
                name: 'Austin Leeds',
                handle: null,
                role: 'remixer',
                position: 2,
              },
            ],
          },
        ]}
        initialMenuOpen
      />
    );

    expect(screen.getByTestId('smart-link-artist-byline')).toHaveTextContent(
      'Tim White feat. Erica Gibson'
    );
    expect(
      screen.getByTestId('smart-link-artist-byline')
    ).not.toHaveTextContent('Austin Leeds');
    fireEvent.click(screen.getByRole('button', { name: 'Credits' }));
    expect(
      screen.getByRole('heading', { name: 'Featured artist' })
    ).toBeVisible();
    expect(screen.getAllByText('Erica Gibson')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Remixer' })).toBeVisible();
    expect(screen.getByText('Austin Leeds')).toBeVisible();
  });

  it('reports a track page at its full release path', () => {
    render(
      <ReleaseLandingPage
        {...defaultProps}
        tracking={{
          contentType: 'track',
          contentId: 'track-1',
          smartLinkSlug: 'night-mix',
        }}
        parentRelease={{ title: 'Midnight Drive', url: '/timwhite/midnight' }}
      />
    );
    expect(screen.getByTestId('powered-by-footer')).toHaveAttribute(
      'data-report-target',
      '/timwhite/midnight/night-mix'
    );
  });

  it('captures javascript: protocol in provider URLs for XSS audit', () => {
    const xssProviders = [
      {
        key: 'spotify' as const,
        label: 'Evil Link',
        accent: '#000',
        url: 'javascript:alert(1)',
      },
    ];
    render(<ReleaseLandingPage {...defaultProps} providers={xssProviders} />);
    const btn = screen.getByTestId('provider-button');
    // The mock captures the href value. In production, the real
    // SmartLinkProviderButton renders an <a> tag. This test documents
    // that the URL passes through without sanitization — a security
    // invariant to monitor. UTM params are appended but the dangerous
    // protocol still passes through unmodified.
    expect(btn.getAttribute('data-href')).toBe(
      'javascript:alert(1)?utm_source=jovie'
    );
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileCompactSurface } from '@/features/profile/templates/ProfileCompactSurface';
import { ProfilePreviewBento } from './ProfilePreviewBento';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

vi.mock('@/features/profile/templates/ProfileCompactSurface', () => ({
  ProfileCompactSurface: vi.fn(({ dataTestId }: { dataTestId?: string }) => (
    <div data-testid={dataTestId ?? 'profile-compact-surface'} />
  )),
}));

function renderBento(
  props: Partial<Parameters<typeof ProfilePreviewBento>[0]> = {}
) {
  return render(
    <ProfilePreviewBento
      artist={PROFILE_STORY_ARTIST}
      socialLinks={[]}
      profileHref='/timwhite'
      {...props}
    />
  );
}

describe('ProfilePreviewBento', () => {
  it('preserves catalog artwork and disables fan capture for an unclaimed review', () => {
    const latestRelease = {
      title: 'Catalog single',
      slug: 'catalog-single',
      artworkUrl: 'https://cdn.example.com/catalog.webp',
      releaseDate: '2026-10-20',
      releaseType: 'single',
    };
    const socialLinks = [
      {
        id: 'instagram',
        artist_id: PROFILE_STORY_ARTIST.id,
        platform: 'instagram',
        url: 'https://instagram.com/artist',
        clicks: 0,
        created_at: '2026-10-20T00:00:00.000Z',
      },
    ];
    renderBento({
      latestRelease,
      allowFanCapture: false,
      headerSocialLinksOverride: socialLinks,
    });

    expect(ProfileCompactSurface).toHaveBeenLastCalledWith(
      expect.objectContaining({
        latestRelease,
        allowFanCapture: false,
        headerSocialLinksOverride: socialLinks,
        showPayButton: false,
        renderInteractiveOverlays: false,
      }),
      undefined
    );
  });
  it('uses domain-specific phone content without mounting the music surface', () => {
    renderBento({ phoneContent: <p>Company draft</p> });
    expect(screen.getByText('Company draft')).toBeInTheDocument();
    expect(
      screen.queryByTestId('profile-compact-surface')
    ).not.toBeInTheDocument();
  });
  it('pins the overlay to the hero corner, outside the phone preview', () => {
    renderBento({
      phonePreviewTestId: 'phone-preview',
      overlay: <div data-testid='dsp-strip'>strip</div>,
    });

    const phonePreview = screen.getByTestId('phone-preview');
    const strip = screen.getByTestId('dsp-strip');

    // Regression (JOV-7192): the strip must never share the phone's bottom
    // CTA band. It lives outside the phone in the hero's top-left corner;
    // the storybook clearance spec measures the rendered geometry.
    expect(phonePreview).not.toContainElement(strip);
  });

  it('renders the phone preview directly when no overlay is supplied', () => {
    renderBento({ phonePreviewTestId: 'phone-preview' });

    expect(screen.getByTestId('phone-preview')).toBeInTheDocument();
    expect(screen.getByTestId('profile-compact-surface')).toBeInTheDocument();
  });

  it('shows the live badge, caption, and footer when provided', () => {
    renderBento({
      showLiveBadge: true,
      caption: 'Your live profile',
      footer: <div data-testid='bento-footer'>footer</div>,
    });

    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Your live profile')).toBeInTheDocument();
    expect(screen.getByTestId('bento-footer')).toBeInTheDocument();
  });
});

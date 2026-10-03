import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfilePreviewBento } from './ProfilePreviewBento';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

vi.mock('@/features/profile/templates/ProfileCompactSurface', () => ({
  ProfileCompactSurface: ({ dataTestId }: { dataTestId?: string }) => (
    <div data-testid={dataTestId ?? 'profile-compact-surface'} />
  ),
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
  it('keeps the overlay in flow under the phone, outside the phone preview', () => {
    renderBento({
      phonePreviewTestId: 'phone-preview',
      overlay: <div data-testid='dsp-strip'>strip</div>,
    });

    const phonePreview = screen.getByTestId('phone-preview');
    const strip = screen.getByTestId('dsp-strip');

    expect(phonePreview).toBeInTheDocument();
    expect(strip).toBeInTheDocument();
    // Regression: the DSP strip used to be absolutely positioned inside the
    // hero and could cover the preview's Listen now CTA.
    expect(phonePreview).not.toContainElement(strip);
    expect(strip.className).not.toContain('absolute');
    expect(
      phonePreview.compareDocumentPosition(strip) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
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

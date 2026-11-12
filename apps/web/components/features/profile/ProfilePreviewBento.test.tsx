import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfilePreviewBento } from './ProfilePreviewBento';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

vi.mock('@/features/profile/templates/ProfileCompactSurface', () => ({
  ProfileCompactSurface: ({
    dataTestId,
    releases = [],
  }: {
    dataTestId?: string;
    releases?: readonly { id: string; title: string }[];
  }) => (
    <div data-testid={dataTestId ?? 'profile-compact-surface'}>
      {releases.map(release => (
        <span key={release.id}>{release.title}</span>
      ))}
    </div>
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

  it('passes real releases to the phone preview surface (JOV-9758)', () => {
    renderBento({
      releases: [
        {
          id: 'r1',
          title: 'Newest Single',
          slug: 'newest-single',
          releaseType: 'single',
          releaseDate: '2026-08-14',
          artworkUrl: null,
          artistNames: ['Artist'],
        },
      ],
    });
    expect(screen.getByText('Newest Single')).toBeInTheDocument();
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

    // ASR-022: the badge reads "Live" as written, never forced into caps.
    expect(screen.getByText('Live')).not.toHaveClass('uppercase');
    expect(screen.getByText('Your live profile')).toBeInTheDocument();
    expect(screen.getByTestId('bento-footer')).toBeInTheDocument();
  });

  it('paints the default hero and bottom fade from the bento tokens', () => {
    const { container } = renderBento({
      dataTestId: 'bento',
      phoneAlign: 'top',
      showBottomFade: true,
    });

    const hero = screen.getByTestId('bento').firstElementChild as HTMLElement;
    expect(hero.style.background).toBe('var(--profile-preview-bento-hero)');
    const fade = container.querySelector(
      '.pointer-events-none.absolute.bottom-0'
    ) as HTMLElement;
    expect(fade.style.background).toBe('var(--profile-preview-bento-fade)');
  });

  it('has no accessibility violations with the live badge and caption', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfilePreviewBento
          artist={PROFILE_STORY_ARTIST}
          socialLinks={[]}
          profileHref='/timwhite'
          showLiveBadge
          caption='Your live profile'
        />
      </div>
    );
    await expectNoA11yViolations(container);
  });
});

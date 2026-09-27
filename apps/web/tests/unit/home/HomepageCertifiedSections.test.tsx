// @coverage-via apps/web/tests/unit/home/HomepageCertifiedSections.test.tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageCertifiedSections } from '@/components/homepage/HomepageCertifiedSections';
import { HomepageClose } from '@/components/homepage/HomepageClose';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { HOMEPAGE_MEDIA_MAP } from '@/data/homepageMediaMap';

const gate = vi.hoisted(() => ({ WAITLIST_ENABLED: false }));
vi.mock('@/lib/flags/marketing-static', () => ({ FEATURE_FLAGS: gate }));
beforeEach(() => {
  gate.WAITLIST_ENABLED = false;
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, loading, ...rest } = props;
    void fill;
    void priority;
    void quality;
    void loading;
    return <img alt='' {...rest} />;
  },
}));

describe('HomepageCertifiedSections', () => {
  it('renders the locked connected and relationships sections without unsupported proof', () => {
    render(
      <HomepageCertifiedSections
        previews={{
          connected: HOMEPAGE_MEDIA_MAP.connected.asset,
          relationships: HOMEPAGE_MEDIA_MAP.relationships.asset,
        }}
      />
    );

    expect(
      screen.queryByTestId('marketing-section-logo-cloud')
    ).not.toBeInTheDocument();

    const sections = screen.getAllByTestId('marketing-section-feature-split');
    expect(sections).toHaveLength(2);
    expect(
      sections.map(section => section.getAttribute('data-marketing-occurrence'))
    ).toEqual(['connected', 'relationships']);

    const connected = document.querySelector<HTMLElement>(
      '[data-homepage-testid="homepage-section-connected"]'
    )!;
    expect(connected).toHaveAttribute('data-marketing-variant', 'editorial');
    expect(connected).toHaveAttribute('data-rhythm', 'product');
    expect(connected).toHaveTextContent('IDENTITY, ACROSS THE INTERNET');
    expect(connected).toHaveTextContent(
      HOMEPAGE_LAUNCH_COPY.certified.sections[0].headline
    );
    expect(connected).toHaveTextContent(
      HOMEPAGE_LAUNCH_COPY.certified.sections[0].body
    );
    expect(connected.querySelectorAll('[data-homepage-visual]')).toHaveLength(
      1
    );
    expect(connected.querySelector('.ap-phone-frame')).toBeNull();

    // JOV-6297: the conceptual artwork is replaced by the approved
    // customer-zero profile surface — real avatar, name, and public URL
    // beside the real product export.
    expect(
      within(connected)
        .getByAltText('Tim White Profile — Listen')
        .getAttribute('src')
    ).toContain(HOMEPAGE_MEDIA_MAP.connected.asset.publicUrl);
    const avatar = connected.querySelector<HTMLImageElement>(
      '.homepage-connected-profile__avatar'
    )!;
    expect(avatar).toHaveAttribute('src', '/images/avatars/tim-white.jpg');
    expect(connected).toHaveTextContent('Tim White');
    expect(connected).toHaveTextContent('jov.ie/tim');
    expect(
      connected.querySelector('[src*="homepage-identity-optical"]')
    ).toBeNull();

    const relationships = document.querySelector<HTMLElement>(
      '[data-homepage-testid="homepage-section-relationships"]'
    )!;
    expect(relationships).toHaveAttribute('data-rhythm', 'product');
    expect(relationships).toHaveTextContent(
      HOMEPAGE_LAUNCH_COPY.certified.sections[1].headline
    );
    expect(relationships).toHaveTextContent(
      HOMEPAGE_LAUNCH_COPY.certified.sections[1].body
    );
    expect(relationships.querySelectorAll('img')).toHaveLength(1);
    expect(
      relationships.querySelectorAll('[data-homepage-visual]')
    ).toHaveLength(1);
    expect(
      within(relationships).getByAltText('Tim White Profile — Subscribe')
    ).toHaveAttribute('src', HOMEPAGE_MEDIA_MAP.relationships.asset.publicUrl);
    const outcomesList = within(relationships)
      .getAllByRole('list')
      .find(list => list.getAttribute('aria-label') === 'Relationships')!;
    expect(outcomesList).toBeDefined();

    // JOV-6297: static ordered states of the shipped visibility surfaces —
    // the public profile for people and the documented {username}/llms.txt
    // for agents. No simulated third-party answer or vendor claim.
    const visibility = within(relationships).getByRole('list', {
      name: 'One Profile, Legible To People And To Agents',
    });
    const states = within(visibility).getAllByRole('listitem');
    expect(states).toHaveLength(2);
    expect(states[0]).toHaveAttribute('data-audience', 'people');
    expect(states[1]).toHaveAttribute('data-audience', 'agents');
    expect(states[0]).toHaveTextContent('People');
    expect(states[0]).toHaveTextContent('jov.ie/tim');
    // The phone frame no longer takes size variants; the frame scales with
    // its container and must not emit a retired data-size attribute.
    expect(relationships.querySelector('.ap-phone-frame')).not.toHaveAttribute(
      'data-size'
    );
    expect(
      within(states[0])
        .getByAltText('Tim White Profile — Subscribe')
        .getAttribute('src')
    ).toContain('tim-white-profile-subscribe-phone.png');
    expect(states[1]).toHaveTextContent('Agents');
    expect(states[1]).toHaveTextContent('# Tim White');
    expect(states[1]).toHaveTextContent('Canonical URL');
    expect(states[1]).toHaveTextContent('jov.ie/tim/llms.txt');
    expect(relationships).not.toHaveTextContent('VERIFIED');

    const outcomes = within(outcomesList).getAllByRole('listitem');
    expect(outcomes).toHaveLength(3);
    expect(outcomes.map(outcome => outcome.textContent)).toEqual([
      expect.stringContaining('Be found. Be understood.'),
      expect.stringContaining('Know who cares.'),
      expect.stringContaining('Built around who you are.'),
    ]);
    expect(
      outcomes.map(outcome => outcome.querySelector('span')?.textContent)
    ).toEqual(['01', '02', '03']);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('records publication and fallback receipts for every homepage asset', () => {
    for (const media of Object.values(HOMEPAGE_MEDIA_MAP)) {
      expect(media.publicationState).toBe('current-public-export');
      expect(media.rightsPrivacyApproval).toContain('approved');
      expect(media.placeholder).toBe(false);
      expect(media.expiration).toBeNull();
      expect(media.intendedCrop.desktop).toContain('uncropped');
      expect(media.intendedCrop.mobile).toContain('uncropped');
      expect(media.loading).toBe('lazy');
      expect(media.reducedMotionFallback).toContain('static');
    }
  });
});

describe('HomepageClose', () => {
  it('requests access instead of focusing absent search when gated', () => {
    gate.WAITLIST_ENABLED = true;
    render(<HomepageClose />);
    expect(
      screen.getByRole('link', { name: 'Request access' })
    ).toHaveAttribute('href', '/signup');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('renders the saved closing headline and a single focus-only action', () => {
    render(<HomepageClose />);
    const section = screen.getByRole('region', {
      name: 'Take control of your presence.',
    });
    expect(section).toBe(screen.getByTestId('marketing-section-cta'));
    expect(within(section).getAllByRole('button')).toHaveLength(1);
    expect(
      within(section).getByRole('button', { name: 'Find your profile' })
    ).toHaveAttribute('type', 'button');
    expect(within(section).queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('returns focus to the existing name without submitting or clearing it', () => {
    const submit = vi.fn();
    render(
      <>
        <form onSubmit={submit}>
          <input
            id='homepage-name-search'
            aria-label='Name'
            defaultValue='Beyoncé'
          />
        </form>
        <HomepageClose />
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Find your profile' }));
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(screen.getByLabelText('Name')).toHaveValue('Beyoncé');
    expect(submit).not.toHaveBeenCalled();
  });
});

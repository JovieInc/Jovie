// @coverage-via apps/web/tests/unit/home/HomepageCertifiedSections.test.tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HomepageCertifiedSections,
  HomepageEditorialFeatureSection,
} from '@/components/homepage/HomepageCertifiedSections';
import { HomepageClose } from '@/components/homepage/HomepageClose';
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
  it('renders one relationships section with real jov.ie/tim next steps (JOV-6946)', () => {
    render(
      <HomepageCertifiedSections
        previews={{
          subscribe: HOMEPAGE_MEDIA_MAP.relationships.asset,
          pay: HOMEPAGE_MEDIA_MAP.pay.asset,
        }}
      />
    );

    const sections = document.querySelectorAll('[data-homepage-testid]');
    expect(sections).toHaveLength(1);
    const section = sections[0] as HTMLElement;
    expect(section).toHaveAttribute(
      'data-homepage-testid',
      'homepage-section-relationships'
    );
    expect(section).toHaveAttribute('data-marketing-variant', 'editorial');
    expect(
      within(section).getByRole('heading', {
        level: 2,
        name: 'Turn attention into relationships.',
      })
    ).toBeInTheDocument();
    expect(section.textContent).not.toMatch(/\u2014/);

    // Real captures only, in visual accent order: pay, then updates.
    const images = within(section).getAllByRole('img');
    expect(images.map(image => image.getAttribute('src'))).toEqual([
      HOMEPAGE_MEDIA_MAP.pay.asset.publicUrl,
      HOMEPAGE_MEDIA_MAP.relationships.asset.publicUrl,
    ]);
    expect(section).toHaveTextContent('A direct way to pay Tim, in one tap.');
    expect(section).toHaveTextContent(
      'Tim’s updates, sent only to people who asked for them.'
    );
    expect(section.querySelector('.homepage-chapter-visual')).toBeNull();
    expect(section).not.toHaveTextContent(/Listener|Collaborator|Investor/);
  });

  it('renders one record-owned editorial section with one real capture', () => {
    render(
      <HomepageEditorialFeatureSection
        section={{
          id: 'capture-1',
          headline: 'Build a direct relationship.',
          body: 'Subscribers hear when you have news.',
        }}
        previews={[{ image: HOMEPAGE_MEDIA_MAP.pay.asset }]}
      />
    );

    const section = screen.getByTestId('marketing-section-feature-split');
    expect(section).toHaveAttribute('data-marketing-variant', 'editorial');
    expect(section).toHaveAttribute(
      'data-homepage-testid',
      'homepage-section-capture-1'
    );
    expect(
      within(section).getByRole('heading', {
        level: 2,
        name: 'Build a direct relationship.',
      })
    ).toBeInTheDocument();
    expect(section).toHaveTextContent('Subscribers hear when you have news.');
    expect(within(section).getAllByRole('img')).toHaveLength(1);
    expect(within(section).getByRole('img')).toHaveAttribute(
      'src',
      HOMEPAGE_MEDIA_MAP.pay.asset.publicUrl
    );
    expect(section.querySelector('figcaption')).toBeNull();
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
  it('returns to the name search instead of requesting access when gated', () => {
    gate.WAITLIST_ENABLED = true;
    render(<HomepageClose />);
    expect(
      screen.getByRole('button', { name: 'Find your profile' })
    ).toHaveAttribute('type', 'button');
    expect(
      screen.queryByRole('link', { name: 'Request access' })
    ).not.toBeInTheDocument();
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
            id='homepage-claim-handle'
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

// Canonical Pen homepage v3 body and close (dark launch behind HOMEPAGE_V3_ENABLED).
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageIdentityClose } from '@/components/homepage/HomepageIdentityClose';
import {
  HOMEPAGE_PRESENCE_MATERIAL,
  HomepageIdentitySections,
} from '@/components/homepage/HomepageIdentitySections';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';

const gate = vi.hoisted(() => ({ WAITLIST_ENABLED: true }));
vi.mock('@/lib/flags/marketing-static', () => ({ FEATURE_FLAGS: gate }));
beforeEach(() => {
  gate.WAITLIST_ENABLED = true;
});

vi.mock('@/components/homepage/homepage-analytics', () => ({
  trackHomepageEvent: vi.fn(),
}));

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
    const { fill, priority, quality, ...rest } = props;
    void fill;
    void quality;
    return (
      <img alt='' data-priority={priority ? 'true' : undefined} {...rest} />
    );
  },
}));

const ICP_TERMS =
  /\b(?:artists?|musicians?|music|songs?|releases?|tours?|fans?|streams?|albums?|presaves?|creators?)\b/i;

describe('HomepageIdentitySections', () => {
  it('renders presence and structure in order without unsupported proof', () => {
    render(<HomepageIdentitySections />);

    const sections = screen.getAllByTestId('marketing-section-feature-split');
    expect(
      sections.map(section => section.getAttribute('data-marketing-occurrence'))
    ).toEqual(['presence', 'structure']);
    expect(
      screen.queryByTestId('marketing-section-logo-cloud')
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    ).toEqual(['Your presence, resolved.', 'Structure that travels.']);

    const presence = sections[0];
    expect(presence).toHaveTextContent('Connected presence');
    expect(presence).toHaveTextContent(
      'The work you share. The places people find you. Bring them together in your Jovie profile.'
    );
    expect(
      within(presence).getByRole('heading', {
        level: 3,
        name: 'A clear next step.',
      })
    ).toBeInTheDocument();
    expect(presence).toHaveTextContent(
      'Read the work. Start a conversation. Attend an event or send a payment.'
    );

    const structure = sections[1];
    expect(structure.querySelectorAll('img')).toHaveLength(0);
    expect(
      within(structure).getByTestId('homepage-structure-identity')
    ).toHaveTextContent('01 / IdentityYour Jovie profilejov.ie/you');
    const list = within(structure).getByRole('list', {
      name: 'Profile Possibilities',
    });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map(item => item.textContent)
    ).toEqual([
      'ProfileName, story, work',
      'LinksOne place to explore',
      'EventsA reason to meet',
      'PaymentsA direct way to pay',
    ]);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('uses the purple satin material once, lazily, only in the presence strip', () => {
    render(<HomepageIdentitySections />);

    const backgrounds = [
      ...document.querySelectorAll('[data-background-image]'),
    ];
    expect(backgrounds).toHaveLength(1);
    const material = screen.getByTestId('homepage-presence-material');
    expect(material).toBe(backgrounds[0]);
    expect(material).toHaveAttribute('aria-hidden', 'true');
    expect(
      material.closest('[data-homepage-testid="homepage-section-presence"]')
    ).not.toBeNull();
    const image = material.querySelector('img');
    expect(image).toHaveAttribute('src', HOMEPAGE_PRESENCE_MATERIAL.src);
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).not.toHaveAttribute('data-priority');
  });

  it('keeps chapter and close copy generic and free of em dashes', () => {
    const { sections, close } = HOMEPAGE_IDENTITY_COPY;
    for (const line of [
      close.headline,
      ...sections.flatMap(section => [
        section.eyebrow,
        section.headline,
        section.body,
      ]),
    ]) {
      expect(line).not.toMatch(ICP_TERMS);
      expect(line).not.toContain('—');
    }
    const { container } = render(
      <>
        <HomepageIdentitySections />
        <HomepageIdentityClose />
      </>
    );
    expect(container.textContent ?? '').not.toMatch(ICP_TERMS);
    expect(container.textContent ?? '').not.toContain('—');
  });
});

describe('HomepageIdentityClose', () => {
  it('repeats the certified name search action when gated (JOV-5085)', () => {
    render(<HomepageIdentityClose />);

    const section = screen.getByRole('region', {
      name: 'Make it your Jovie profile.',
    });
    expect(section).toBe(screen.getByTestId('marketing-section-cta'));
    expect(section).toHaveAttribute('data-homepage-testid', 'homepage-close');
    expect(within(section).getByRole('combobox')).toHaveAttribute(
      'placeholder',
      'Search your name'
    );
    expect(within(section).getByTestId('homepage-close-cta')).toHaveTextContent(
      'Find me'
    );
    expect(within(section).queryAllByRole('link')).toHaveLength(0);
    expect(
      within(section).queryByText('Request access')
    ).not.toBeInTheDocument();
  });

  it('returns focus to the hero name search while the waitlist is off', () => {
    gate.WAITLIST_ENABLED = false;
    render(
      <>
        <input id='homepage-name-search' aria-label='Name' />
        <HomepageIdentityClose />
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Find your profile' }));
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });
});

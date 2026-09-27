// @coverage-via apps/web/tests/unit/home/HomepageCertifiedSections.test.tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOMEPAGE_PRESENCE_MATERIAL,
  HomepageCertifiedSections,
} from '@/components/homepage/HomepageCertifiedSections';
import { HomepageClose } from '@/components/homepage/HomepageClose';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

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
    const { fill, priority, quality, ...rest } = props;
    void fill;
    void quality;
    return (
      <img alt='' data-priority={priority ? 'true' : undefined} {...rest} />
    );
  },
}));

describe('HomepageCertifiedSections', () => {
  it('renders the canonical presence and structure sections without unsupported proof', () => {
    render(<HomepageCertifiedSections />);

    expect(
      screen.queryByTestId('marketing-section-logo-cloud')
    ).not.toBeInTheDocument();

    const sections = screen.getAllByTestId('marketing-section-feature-split');
    expect(sections).toHaveLength(2);
    expect(
      sections.map(section => section.getAttribute('data-marketing-occurrence'))
    ).toEqual(['presence', 'structure']);

    const [presenceCopy, structureCopy] =
      HOMEPAGE_LAUNCH_COPY.certified.sections;
    const presence = document.querySelector<HTMLElement>(
      '[data-homepage-testid="homepage-section-presence"]'
    )!;
    expect(presence).toHaveAttribute('data-marketing-variant', 'editorial');
    expect(presence).toHaveAttribute('data-media', 'true');
    expect(presence).toHaveTextContent('Connected presence');
    expect(presence).toHaveTextContent(presenceCopy.headline);
    expect(presence).toHaveTextContent(presenceCopy.body);
    expect(
      within(presence).getByRole('heading', {
        level: 3,
        name: 'A clear next step.',
      })
    ).toBeInTheDocument();
    expect(presence).toHaveTextContent(
      'Read the work. Start a conversation. Attend an event or send a payment.'
    );
    const material = within(presence).getByTestId('homepage-presence-material');
    expect(material).toHaveAttribute('aria-hidden', 'true');
    expect(material.querySelector('img')).toHaveAttribute(
      'src',
      HOMEPAGE_PRESENCE_MATERIAL.src
    );
    // Below the fold: lazy, never priority.
    expect(material.querySelector('img')).toHaveAttribute('loading', 'lazy');
    expect(material.querySelector('img')).not.toHaveAttribute('data-priority');

    const structure = document.querySelector<HTMLElement>(
      '[data-homepage-testid="homepage-section-structure"]'
    )!;
    expect(structure).toHaveAttribute('data-media', 'false');
    expect(structure).toHaveTextContent(structureCopy.headline);
    expect(structure).toHaveTextContent(structureCopy.body);
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
      name: 'Make it your Jovie profile.',
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

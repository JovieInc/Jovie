// @coverage-via apps/web/tests/unit/home/HomepageCertifiedSections.test.tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageCertifiedSections } from '@/components/homepage/HomepageCertifiedSections';
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
    render(<HomepageCertifiedSections />);

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
    expect(connected.querySelector('.ap-phone-frame')).toBeNull();
    expect(connected.querySelector('img')).toHaveAttribute(
      'src',
      '/assets/generated/homepage-identity-optical-v1.webp'
    );
    expect(connected.querySelector('img')).toHaveAttribute(
      'alt',
      'A conceptual photographic assembly of a profile identity'
    );

    const relationships = document.querySelector<HTMLElement>(
      '[data-homepage-testid="homepage-section-relationships"]'
    )!;
    expect(relationships).toHaveAttribute('data-rhythm', 'text');
    expect(relationships).toHaveTextContent(
      HOMEPAGE_LAUNCH_COPY.certified.sections[1].headline
    );
    expect(relationships).toHaveTextContent(
      HOMEPAGE_LAUNCH_COPY.certified.sections[1].body
    );
    const identity = HOMEPAGE_LAUNCH_COPY.certified.identity;
    const portraits = relationships.querySelectorAll('img');
    expect(portraits).toHaveLength(1);
    expect(portraits[0]).toHaveAttribute('src', identity.subject.portrait.src);
    expect(portraits[0]).toHaveAttribute('alt', identity.subject.portrait.alt);
    const outcomeList = within(relationships).getByRole('list', {
      name: 'Relationships',
    });
    const outcomes = within(outcomeList).getAllByRole('listitem');
    expect(outcomes).toHaveLength(3);
    expect(outcomes.map(outcome => outcome.textContent)).toEqual([
      expect.stringContaining('Be found. Be understood.'),
      expect.stringContaining('Know who cares.'),
      expect.stringContaining('Built around who you are.'),
    ]);
    expect(
      outcomes.map(outcome => outcome.querySelector('span')?.textContent)
    ).toEqual(['01', '02', '03']);

    const identityBlock = relationships.querySelector<HTMLElement>(
      '[data-homepage-testid="homepage-identity"]'
    )!;
    expect(identityBlock).toHaveAttribute(
      'data-homepage-identity-for',
      'built'
    );
    expect(identityBlock).toHaveTextContent('You are not one thing.');
    expect(identityBlock).toHaveTextContent(identity.subject.name);
    expect(identityBlock).toHaveTextContent(identity.subject.profileDisplay);
    expect(identityBlock).toHaveTextContent('One identity. Every side of you.');

    const lensGroup = within(identityBlock).getByRole('list', {
      name: 'Perspectives',
    });
    const lenses = within(lensGroup).getAllByRole('button');
    expect(lenses.map(lens => lens.textContent)).toEqual(
      identity.lenses.map(lens => lens.label)
    );

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(
      screen.getAllByRole('button').map(button => button.getAttribute('type'))
    ).toEqual(['button', 'button', 'button']);
  });

  it('switches the caption emphasis across the three contextual lenses', () => {
    render(<HomepageCertifiedSections />);
    const identity = HOMEPAGE_LAUNCH_COPY.certified.identity;
    const block = document.querySelector<HTMLElement>(
      '[data-homepage-testid="homepage-identity"]'
    )!;
    const emphasis = block.querySelector('.homepage-identity__emphasis')!;

    const lensFor = (id: string) =>
      block.querySelector<HTMLButtonElement>(
        `[data-homepage-testid="homepage-identity-lens-${id}"]`
      )!;

    expect(lensFor('listener')).toHaveAttribute('aria-pressed', 'true');
    expect(emphasis).toHaveTextContent('Artist. Releases. Shows.');

    fireEvent.click(lensFor('collaborator'));
    expect(lensFor('collaborator')).toHaveAttribute('aria-pressed', 'true');
    expect(lensFor('listener')).toHaveAttribute('aria-pressed', 'false');
    expect(emphasis).toHaveTextContent('Producer. Credits. Contact.');

    fireEvent.click(lensFor('investor'));
    expect(lensFor('investor')).toHaveAttribute('aria-pressed', 'true');
    expect(emphasis).toHaveTextContent('Founder. Company. Work.');

    expect(identity.lenses).toHaveLength(3);
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

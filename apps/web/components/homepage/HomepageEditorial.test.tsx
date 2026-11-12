import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import {
  HOMEPAGE_EDITORIAL_COPY,
  HOMEPAGE_INVITE_ANCHOR,
} from '@/data/homepageEditorialCopy';
import { HOMEPAGE_CLAIM_ANCHOR } from '@/data/homepageInviteAnchor';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

// Per-chapter rendered-state and accessibility coverage. The page-level copy,
// route and imagery contract lives in tests/unit/home/homepage-contract.test.tsx.
vi.mock('@/components/atoms/InvisibleTurnstile', () => ({
  InvisibleTurnstile: () => null,
  isTurnstileClientBypassed: () => true,
  isTurnstileClientConfigured: () => false,
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, ...rest } = props;
    void fill;
    void priority;
    void quality;
    return <img alt='' {...rest} />;
  },
}));

import {
  HomepageInviteClose,
  HomepageProfileChapter,
  HomepageReleasesChapter,
  HomepageStoryHero,
} from './HomepageEditorial';

const COPY = HOMEPAGE_EDITORIAL_COPY;

/** The PUBLIC_SIGNUP_CLOSED kill switch brings the invite-only page back. */
function closePublicSignup() {
  vi.stubEnv('FEATURE_PUBLIC_SIGNUP_CLOSED', 'true');
}

describe('HomepageEditorial chapters', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the hero as one labelled section with the locked headline and two actions', async () => {
    const { container } = render(<HomepageStoryHero />);

    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero).toHaveAttribute('aria-labelledby', 'home-hero-heading');
    expect(
      screen.getByRole('heading', { level: 1, name: COPY.hero.headline })
    ).toHaveAttribute('id', 'home-hero-heading');
    expect(screen.getByTestId('homepage-primary-cta')).toHaveAttribute(
      'href',
      getClaimProfileIntent().href
    );
    expect(screen.getByTestId('homepage-hero-live-profile')).toHaveAttribute(
      'href',
      COPY.hero.secondaryHref
    );
    expect(
      screen.getByRole('img', { name: COPY.hero.windowLabel })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('indexes every chapter and reaches the hero actions by keyboard', async () => {
    const user = userEvent.setup();
    render(<HomepageStoryHero />);

    const index = screen.getByRole('navigation', { name: COPY.chaptersLabel });
    expect(
      within(index)
        .getAllByRole('link')
        .map(link => link.getAttribute('href'))
    ).toEqual([
      '#feature-split',
      '#product-gallery',
      '#specs',
      `#${HOMEPAGE_CLAIM_ANCHOR}`,
    ]);

    await user.tab();
    expect(screen.getByTestId('homepage-primary-cta')).toHaveFocus();
    await user.tab();
    expect(screen.getByTestId('homepage-hero-live-profile')).toHaveFocus();
  });

  it('renders the profile chapter with its rows as a description list', async () => {
    const { container } = render(<HomepageProfileChapter />);

    expect(
      screen.getByRole('heading', { level: 2, name: COPY.profile.headline })
    ).toBeInTheDocument();
    for (const row of COPY.profile.rows) {
      expect(screen.getByText(row.label).tagName).toBe('DT');
      expect(screen.getByText(row.value).tagName).toBe('DD');
    }
    await expectNoA11yViolations(container);
  });

  it('renders the releases chapter with labelled product imagery and captions', async () => {
    const { container } = render(<HomepageReleasesChapter />);

    expect(
      screen.getByRole('heading', { level: 2, name: COPY.releases.headline })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: COPY.releases.catalogLabel })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: COPY.releases.releasePageLabel })
    ).toBeInTheDocument();
    // Three captions plus the mock release page's own title, all under the h2.
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
    await expectNoA11yViolations(container);
  });

  it('closes on the invite form and the three numbered steps while signup is closed', async () => {
    closePublicSignup();
    const { container } = render(
      <>
        <HomepageStoryHero />
        <HomepageInviteClose />
      </>
    );

    const section = screen.getByTestId('marketing-section-cta');
    expect(section).toHaveAttribute('id', HOMEPAGE_INVITE_ANCHOR);
    // Links to the claim section still land here.
    expect(
      within(section).getByTestId('homepage-close-anchor-alias')
    ).toHaveAttribute('id', HOMEPAGE_CLAIM_ANCHOR);
    expect(
      screen.getByRole('heading', { level: 2, name: COPY.invite.headline })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('homepage-close-cta')).toBeNull();
    expect(screen.getByTestId('homepage-primary-cta')).toHaveAttribute(
      'href',
      `#${HOMEPAGE_INVITE_ANCHOR}`
    );
    expect(
      within(screen.getByRole('navigation', { name: COPY.chaptersLabel }))
        .getAllByRole('link')
        .at(-1)
    ).toHaveAttribute('href', `#${HOMEPAGE_INVITE_ANCHOR}`);
    expect(
      screen.getAllByRole('button', { name: COPY.invite.action }).length
    ).toBeGreaterThan(0);
    const steps = within(section).getAllByRole('listitem');
    expect(steps).toHaveLength(COPY.invite.steps.length);
    expect(steps[0]).toHaveTextContent(`01${COPY.invite.steps[0].title}`);
    await expectNoA11yViolations(container);
  });

  it('closes on one claim link, with no invitation copy', async () => {
    const claim = getClaimProfileIntent();
    const { container } = render(
      <>
        <HomepageStoryHero />
        <HomepageInviteClose />
      </>
    );

    const section = screen.getByTestId('marketing-section-cta');
    expect(
      within(section).getByRole('heading', {
        level: 2,
        name: ARTIST_PROFILE_COPY.finalCta.headline,
      })
    ).toBeInTheDocument();
    expect(
      within(section).getByText(ARTIST_PROFILE_COPY.finalCta.subhead)
    ).toBeInTheDocument();
    const close = within(section).getByTestId('homepage-close-cta');
    expect(close).toHaveAttribute('href', claim.href);
    expect(close).toHaveTextContent(claim.label);
    expect(close).toHaveAttribute('data-analytics-event', claim.eventName);
    expect(section).toHaveAttribute('id', HOMEPAGE_CLAIM_ANCHOR);
    // Old links to the invitation form still land here.
    const alias = within(section).getByTestId('homepage-close-anchor-alias');
    expect(alias).toHaveAttribute('id', HOMEPAGE_INVITE_ANCHOR);
    expect(alias).toBeEmptyDOMElement();
    expect(
      within(
        screen.getByRole('navigation', { name: COPY.chaptersLabel })
      ).getByRole('link', { name: /claim/ })
    ).toHaveAttribute('href', '#claim-profile');
    // The form, its steps and every invitation word are gone, on both the
    // close and the hero's chapter index.
    expect(within(section).queryByRole('button')).not.toBeInTheDocument();
    expect(within(section).queryByRole('listitem')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/invit/i);
    // One primary action on the page: the hero's.
    expect(
      container.querySelectorAll('[data-primary-action="true"]')
    ).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('wraps long caller copy without dropping any of it', async () => {
    const headline =
      'One name that every listener, promoter, label and playlist editor finds the same way, everywhere.';
    const body =
      'Your profile at jov.ie leads with what matters now: your latest release, your links, the shows you have coming up and a way for listeners to get updates. '.repeat(
        2
      );
    const { container } = render(
      <HomepageProfileChapter copy={{ headline, body }} />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: headline })
    ).toHaveClass('text-balance');
    expect(screen.getByText(body.trim())).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the hero and a translated chapter in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <HomepageStoryHero
          copy={{ ...COPY.hero, subhead: 'ملفك وكل إصدار ورابط لكل منصة.' }}
        />
        <HomepageProfileChapter
          copy={{
            headline: 'اسم واحد. في كل مكان.',
            body: 'ملفك يقود بالجديد.',
          }}
        />
      </div>
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'اسم واحد. في كل مكان.' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('ملفك وكل إصدار ورابط لكل منصة.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('enters /start from the hero, and keeps the invitation action only while signup is closed', async () => {
    const claim = getClaimProfileIntent();
    const open = render(<HomepageStoryHero />);
    const start = screen.getByTestId('homepage-primary-cta');
    expect(start).toHaveAttribute('href', '/start');
    expect(start).toHaveAttribute('href', claim.href);
    expect(start).toHaveAttribute('data-primary-action', 'true');
    expect(start).toHaveTextContent(claim.label);
    // The note describes the invitation form, so it leaves with that action.
    expect(screen.queryByText(COPY.hero.note)).not.toBeInTheDocument();
    expect(screen.getByTestId('homepage-hero-live-profile')).toHaveAttribute(
      'href',
      COPY.hero.secondaryHref
    );
    await expectNoA11yViolations(open.container);
    open.unmount();

    closePublicSignup();
    render(<HomepageStoryHero />);
    const invite = screen.getByTestId('homepage-primary-cta');
    expect(invite).toHaveAttribute('href', COPY.hero.primaryHref);
    expect(invite).toHaveTextContent(COPY.hero.primaryAction);
    expect(screen.getByText(COPY.hero.note)).toBeInTheDocument();
  });
});
